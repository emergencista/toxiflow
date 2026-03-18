import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();
dotenv.config({ path: ".env.local", override: false });

type QueueRow = {
  id: number;
  drug_slug: string;
  drug_name: string;
  article_url: string;
  article_title: string | null;
  source: string | null;
  suggested_update_payload: unknown;
};

type SuggestionResponse = {
  alerta_clinico: string | null;
  apresentacao_clinica: string | null;
  tratamento: string | null;
  suporte_clinico: string | null;
  referencia: string;
};

type BatchResult = {
  index: number;
  article_url: string;
  drug_name: string;
  suggestion: SuggestionResponse | null;
  error?: string;
};

const WEEKLY_LIMIT = parseEnvInt("TOX_WEEKLY_PROCESS_LIMIT", 200, 1, 1000);
const FETCH_TIMEOUT_MS = parseEnvInt("TOX_WEEKLY_FETCH_TIMEOUT_MS", 15000, 1000, 120000);

function parseEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw || !String(raw).trim()) return fallback;
  const parsed = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function getEnv(name: string, fallback = ""): string {
  const value = process.env[name];
  if (value && String(value).trim()) return String(value).trim();
  return fallback;
}

function compactWhitespace(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeNullable(value: unknown): string | null {
  const compact = compactWhitespace(value);
  return compact.length ? compact : null;
}

function normalizeSuggestionFromApi(suggestion: SuggestionResponse): SuggestionResponse {
  return {
    alerta_clinico: normalizeNullable(suggestion.alerta_clinico),
    apresentacao_clinica: normalizeNullable(suggestion.apresentacao_clinica),
    tratamento: normalizeNullable(suggestion.tratamento),
    suporte_clinico: normalizeNullable(suggestion.suporte_clinico),
    referencia: compactWhitespace(suggestion.referencia),
  };
}

function htmlToText(html: string): string {
  return compactWhitespace(
    String(html || "")
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
  );
}

function buildSuggestionsApiUrl(): string {
  const explicit = getEnv("TOXIFLOW_SUGGESTIONS_API_URL");
  if (explicit) {
    return explicit;
  }

  const origin = getEnv("TOXIFLOW_INTERNAL_API_ORIGIN", "http://127.0.0.1:3002").replace(/\/$/, "");
  const basePath = getEnv("TOXIFLOW_BASE_PATH", "").replace(/\/$/, "");
  const routePath = getEnv("TOXIFLOW_SUGGESTIONS_API_PATH", "/api/suggestions/process");
  const normalizedRoutePath = routePath.startsWith("/") ? routePath : `/${routePath}`;
  return `${origin}${basePath}${normalizedRoutePath}`;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "toxiflow-weekly-processor/1.0" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function inferUpdateScopeFromSuggestion(suggestion: SuggestionResponse): string {
  if (suggestion.tratamento || suggestion.suporte_clinico) {
    return "antidoto e conduta";
  }

  if (suggestion.alerta_clinico || suggestion.apresentacao_clinica) {
    return "notas clinicas e referencia";
  }

  return "notas clinicas e referencia";
}

function buildSuggestedPayload(suggestion: SuggestionResponse) {
  const aiFields = {
    alerta_clinico: suggestion.alerta_clinico,
    apresentacao_clinica: suggestion.apresentacao_clinica,
    tratamento: suggestion.tratamento,
    suporte_clinico: suggestion.suporte_clinico,
    referencia: suggestion.referencia,
  };

  const proposedFields: Record<string, unknown> = {
    guideline_ref: suggestion.referencia,
    notes: [
      "Processado semanalmente por IA (Gemini).",
      `Fonte: ${suggestion.referencia}`,
    ],
    // Explicit null preserves UI logic for "no clinical treatment suggestion".
    treatment: suggestion.tratamento ? [suggestion.tratamento] : null,
  };

  if (suggestion.alerta_clinico) {
    proposedFields.alert_message = suggestion.alerta_clinico;
  }
  if (suggestion.apresentacao_clinica) {
    proposedFields.clinical_presentation = suggestion.apresentacao_clinica;
  }
  if (suggestion.suporte_clinico) {
    proposedFields.supportive_care = suggestion.suporte_clinico;
  }

  const aspectSuggestions: Record<string, unknown> = {
    referencia: suggestion.referencia,
  };

  if (suggestion.alerta_clinico) {
    aspectSuggestions.alerta_clinico = suggestion.alerta_clinico;
  }
  if (suggestion.apresentacao_clinica) {
    aspectSuggestions.apresentacao_clinica = suggestion.apresentacao_clinica;
  }
  if (suggestion.tratamento) {
    aspectSuggestions.tratamento = suggestion.tratamento;
  }
  if (suggestion.suporte_clinico) {
    aspectSuggestions.suporte_clinico = suggestion.suporte_clinico;
  }

  return {
    language: "pt-BR",
    processing_mode: "weekly",
    ai_provider: "google-gemini",
    ai_model: "gemini-1.5-flash",
    ai_fields: aiFields,
    proposed_fields: proposedFields,
    aspect_suggestions: aspectSuggestions,
    evidence_lines: [],
  };
}

async function main(): Promise<void> {
  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
  }

  const suggestionsApiUrl = buildSuggestionsApiUrl();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("tox_radar_review_queue")
    .select("id,drug_slug,drug_name,article_url,article_title,source,suggested_update_payload")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(WEEKLY_LIMIT);

  if (error) {
    throw new Error(`Falha ao carregar fila pendente: ${error.message}`);
  }

  const pendingRows = (Array.isArray(data) ? data : []) as QueueRow[];
  if (!pendingRows.length) {
    console.log("[weekly-process] nenhum item pendente para processar");
    return;
  }

  const articles: Array<{
    queue_id: number;
    article_text: string;
    article_title: string;
    article_url: string;
    drug_name: string;
  }> = [];

  for (const row of pendingRows) {
    const articleUrl = compactWhitespace(row.article_url);
    if (!articleUrl) {
      continue;
    }

    const articleTitle = compactWhitespace(row.article_title || "Sem titulo");
    const drugName = compactWhitespace(row.drug_name || "Substancia nao informada");

    let articleText = "";
    try {
      const html = await fetchWithTimeout(articleUrl, FETCH_TIMEOUT_MS);
      articleText = htmlToText(html);
    } catch {
      const fallbackJson = row.suggested_update_payload && typeof row.suggested_update_payload === "object"
        ? JSON.stringify(row.suggested_update_payload)
        : "";
      articleText = compactWhitespace(`${articleTitle} ${fallbackJson}`);
    }

    if (!articleText) {
      continue;
    }

    articles.push({
      queue_id: row.id,
      article_text: articleText.slice(0, 30000),
      article_title: articleTitle,
      article_url: articleUrl,
      drug_name: drugName,
    });
  }

  if (!articles.length) {
    console.log("[weekly-process] nenhum artigo com texto disponivel para processar");
    return;
  }

  const response = await fetch(suggestionsApiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      articles: articles.map((item) => ({
        article_text: item.article_text,
        article_title: item.article_title,
        article_url: item.article_url,
        drug_name: item.drug_name,
      })),
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Falha ao processar lote na IA: HTTP ${response.status} ${bodyText.slice(0, 500)}`);
  }

  let parsed: { results?: BatchResult[] };
  try {
    parsed = JSON.parse(bodyText) as { results?: BatchResult[] };
  } catch {
    throw new Error("Resposta da rota de sugestões não está em JSON válido.");
  }

  const results = Array.isArray(parsed.results) ? parsed.results : [];
  if (!results.length) {
    throw new Error("Resposta da rota de sugestões não retornou results.");
  }

  let updated = 0;
  let failed = 0;

  for (const result of results) {
    const sourceRow = articles[result.index];
    if (!sourceRow) {
      failed += 1;
      continue;
    }

    if (!result.suggestion) {
      failed += 1;
      console.warn(`[weekly-process] queue_id=${sourceRow.queue_id} sem sugestão: ${result.error || "unknown"}`);
      continue;
    }

    const suggestion = normalizeSuggestionFromApi(result.suggestion);
    const payload = buildSuggestedPayload(suggestion);

    const { error: updateError } = await supabase
      .from("tox_radar_review_queue")
      .update({
        update_scope: inferUpdateScopeFromSuggestion(suggestion),
        suggested_alert_message: suggestion.alerta_clinico,
        suggested_clinical_presentation: suggestion.apresentacao_clinica,
        suggested_update_payload: payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceRow.queue_id);

    if (updateError) {
      failed += 1;
      console.warn(`[weekly-process] queue_id=${sourceRow.queue_id} falha update: ${updateError.message}`);
      continue;
    }

    updated += 1;
  }

  console.log(
    `[weekly-process] pendentes=${pendingRows.length} enviados=${articles.length} atualizados=${updated} falhas=${failed}`
  );
}

main().catch((error) => {
  console.error("[weekly-process] erro fatal:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
