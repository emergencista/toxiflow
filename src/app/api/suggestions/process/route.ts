import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

type SuggestionResponse = {
  alerta_clinico: string | null;
  apresentacao_clinica: string | null;
  tratamento: string | null;
  suporte_clinico: string | null;
  referencia: string;
};

type ArticleInput = {
  article_text?: string;
  article_title?: string;
  article_url?: string;
  drug_name?: string;
};

type BatchResult = {
  index: number;
  article_url: string;
  drug_name: string;
  suggestion: SuggestionResponse | null;
  error?: string;
};

const SYSTEM_PROMPT = "Você é um Especialista em Toxicologia Clínica. Sua tarefa é analisar o texto bruto de um artigo e extrair APENAS informações médicas relevantes para o Toxiflow.\nREGRAS:\n\nLIMPEZA: Ignore autores, tags de SEO, datas e categorias de blog.\nTRADUÇÃO: Converta termos técnicos para Português (Brasil).\nCAMPOS VAZIOS: Se o artigo não trouxer nada novo sobre um campo, retorne null. Não invente dados.\nNÃO USE STRING VAZIA: Nunca retorne \"\"; use null quando não houver atualização real.\nFORMATO: Retorne estritamente um JSON: { \"alerta_clinico\": \"string ou null\", \"apresentacao_clinica\": \"string ou null\", \"tratamento\": \"string ou null\", \"suporte_clinico\": \"string ou null\", \"referencia\": \"string\" }";
const GEMINI_MODEL = "models/gemini-1.5-flash";
const GEMINI_MODEL_FALLBACKS = [
  GEMINI_MODEL,
  "models/gemini-flash-latest",
  "models/gemini-2.0-flash",
];

function compactWhitespace(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeNullable(value: unknown): string | null {
  const compact = compactWhitespace(value);
  return compact ? compact : null;
}

function normalizeTreatmentUpdate(value: unknown): string | null {
  const normalized = normalizeNullable(value);
  if (!normalized) return null;

  const text = normalized.toLowerCase();
  const hasActionableSignal = /\b(dose|mg|mcg|g\/kg|iniciar|inicie|considerar|evitar|indicado|contraindicado|monitor|protocolo|conduta|antidoto|n-acetilcisteina|acetilcisteina)\b/.test(text);
  const hasGenericSafetyOnlySignal = /\b(escolha|mais seguro|recomendado|acog|analgesico|antipiretico)\b/.test(text);

  // If text is generic reassurance without concrete actionable update, persist null.
  if (!hasActionableSignal && hasGenericSafetyOnlySignal) {
    return null;
  }

  return normalized;
}

function normalizeStrictSuggestion(payload: unknown): SuggestionResponse {
  const raw = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;

  const referencia = compactWhitespace(raw.referencia);
  if (!referencia) {
    throw new Error("Campo referencia ausente ou vazio no retorno da IA.");
  }

  return {
    alerta_clinico: normalizeNullable(raw.alerta_clinico),
    apresentacao_clinica: normalizeNullable(raw.apresentacao_clinica),
    tratamento: normalizeTreatmentUpdate(raw.tratamento),
    suporte_clinico: normalizeNullable(raw.suporte_clinico),
    referencia,
  };
}

function normalizePostParseSuggestion(payload: unknown): SuggestionResponse {
  // Defensive mapping: guarantees empty strings are converted to null.
  return normalizeStrictSuggestion(payload);
}

function extractJsonObject(rawContent: string): string {
  const withoutFences = rawContent
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  const direct = compactWhitespace(withoutFences);
  if (direct.startsWith("{") && direct.endsWith("}")) {
    return direct;
  }

  const fenced = withoutFences.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }

  const firstBrace = withoutFences.indexOf("{");
  const lastBrace = withoutFences.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return withoutFences.slice(firstBrace, lastBrace + 1);
  }

  return withoutFences;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (error && typeof error === "object") {
    return error as Record<string, unknown>;
  }

  return { message: String(error) };
}

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_API_KEY não configurada." }, { status: 503 });
  }

  let body: { articles?: ArticleInput[] } & ArticleInput = {};
  try {
    body = (await request.json()) as { articles?: ArticleInput[] } & ArticleInput;
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const rawArticles = Array.isArray(body.articles) ? body.articles : [body];
  if (!rawArticles.length) {
    return NextResponse.json({ error: "articles é obrigatório e deve conter ao menos um item." }, { status: 400 });
  }

  const client = new GoogleGenerativeAI(apiKey);

  async function processOne(articleInput: ArticleInput): Promise<SuggestionResponse> {
    const articleText = compactWhitespace(articleInput.article_text);
    const articleTitle = compactWhitespace(articleInput.article_title || "Sem título");
    const articleUrl = compactWhitespace(articleInput.article_url || "URL não informada");
    const drugName = compactWhitespace(articleInput.drug_name || "Substância não informada");

    if (!articleText) {
      throw new Error("article_text é obrigatório.");
    }

    const userPrompt = [
      `Substância-alvo: ${drugName}`,
      `Título: ${articleTitle}`,
      `URL: ${articleUrl}`,
      "",
      "Texto bruto do artigo:",
      articleText,
    ].join("\n");

    try {
      let lastError: unknown = null;

      for (const modelName of GEMINI_MODEL_FALLBACKS) {
        try {
          const model = client.getGenerativeModel({
            model: modelName,
            systemInstruction: SYSTEM_PROMPT,
          });

          const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json",
            },
          });

          const content = result.response.text();
          const jsonText = extractJsonObject(content);
          // Exigência: tratar saída da IA com JSON.parse.
          return normalizePostParseSuggestion(JSON.parse(jsonText));
        } catch (modelError) {
          lastError = modelError;
        }
      }

      throw lastError instanceof Error ? lastError : new Error("Falha sem detalhes ao chamar Gemini.");
    } catch (error) {
      console.error(
        "[suggestions/process] gemini_failure",
        JSON.stringify(
          {
            model: GEMINI_MODEL,
            model_fallbacks: GEMINI_MODEL_FALLBACKS,
            drug_name: drugName,
            article_title: articleTitle,
            article_url: articleUrl,
            article_text_len: articleText.length,
            error: serializeError(error),
          },
          null,
          2
        )
      );

      throw error;
    }
  }

  const results: BatchResult[] = [];
  for (let index = 0; index < rawArticles.length; index += 1) {
    const article = rawArticles[index];
    const articleUrl = compactWhitespace(article.article_url || "URL não informada");
    const drugName = compactWhitespace(article.drug_name || "Substância não informada");

    try {
      const suggestion = await processOne(article);
      results.push({
        index,
        article_url: articleUrl,
        drug_name: drugName,
        suggestion,
      });
    } catch (error) {
      console.error(
        "[suggestions/process] article_failed",
        JSON.stringify(
          {
            index,
            model: GEMINI_MODEL,
            article_url: articleUrl,
            drug_name: drugName,
            error: serializeError(error),
          },
          null,
          2
        )
      );

      results.push({
        index,
        article_url: articleUrl,
        drug_name: drugName,
        suggestion: null,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  // Compatibilidade retroativa para payload com único artigo.
  if (!Array.isArray(body.articles) && results[0]?.suggestion) {
    return NextResponse.json(results[0].suggestion);
  }

  if (!Array.isArray(body.articles) && results[0] && !results[0].suggestion) {
    return NextResponse.json(
      {
        error: "Falha ao processar artigo no Gemini.",
        model: GEMINI_MODEL,
        details: results[0].error || "unknown",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ results });
}
