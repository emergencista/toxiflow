require("dotenv").config();

const Parser = require("rss-parser");
const { createClient } = require("@supabase/supabase-js");

const FEEDS = [
  "https://coreem.net/feed/",
  "https://pharmertoxguy.com/feed/",
  "https://canadiem.org/feed/",
  "https://rebelem.com/feed/",
  "https://emergencymedicinecases.com/feed/",
  "https://emcrit.org/feed/",
  "https://www.emdocs.net/feed/",
  "https://www.thebottomline.org.uk/feed/"
];

const MAX_AUTO_UPDATES_PER_ARTICLE = getEnvInt("TOX_RADAR_MAX_DRUG_UPDATES_PER_ARTICLE", 3, 1, 10);
const MAX_NOTES_PER_DRUG = getEnvInt("TOX_RADAR_MAX_NOTES_PER_DRUG", 14, 4, 30);
const UPDATE_MODE = getUpdateMode(process.env.TOX_RADAR_UPDATE_MODE);

const INTOXICATION_PATTERNS = [
  /\boverdose\b/g,
  /\bpoison(ing|ed)?\b/g,
  /\bintoxicat(ion|ed|ing)?\b/g,
  /\btoxicolog(y|ic)\b/g,
  /\btoxidrome\b/g,
  /\bantidote(s)?\b/g,
  /\benvenenament(o|os)\b/g,
  /\bintoxicaca(o|es)\b/g,
  /\bchumbinho\b/g,
  /\bsalicylate(s)?\b/g,
  /\bacetaminophen\b/g,
  /\bparacetamol\b/g,
  /\bopioid\s+toxicity\b/g,
  /\btoxic\s+alcohol(s)?\b/g
];

const EXCLUSION_PATTERNS = [
  /\btoxic\s+shock\b/g,
  /\btoxic\s+megacolon\b/g,
  /\btoxic\s+epidermal\s+necrolysis\b/g,
  /\bdetox\b/g
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const runtimeSentUrls = new Set();

const FEED_TIMEOUT_MS = getEnvInt("TOX_RADAR_FEED_TIMEOUT_MS", 12000, 1000, 120000);
const FEED_MAX_RETRIES = getEnvInt("TOX_RADAR_FEED_MAX_RETRIES", 2, 0, 5);
const FEED_RETRY_DELAY_MS = getEnvInt("TOX_RADAR_FEED_RETRY_DELAY_MS", 1500, 0, 60000);

function isTableNotInCacheError(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const hint = String(error?.hint || "").toLowerCase();
  const combined = `${message} ${details} ${hint}`;

  return (
    code === "PGRST205" ||
    combined.includes("schema cache") ||
    combined.includes("could not find the table") ||
    combined.includes("relation") && combined.includes("does not exist")
  );
}

function countPatternMatches(text, patterns) {
  let total = 0;

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    total += matches ? matches.length : 0;
  }

  return total;
}

function isRelevantIntoxicationContent(item) {
  const title = normalizeText(item.title);
  const body = normalizeText([
    item.contentSnippet,
    item.content,
    item.summary,
    item["content:encoded"]
  ].join(" "));

  const exclusionsInTitle = countPatternMatches(title, EXCLUSION_PATTERNS);
  if (exclusionsInTitle > 0) {
    return false;
  }

  const titleHits = countPatternMatches(title, INTOXICATION_PATTERNS);
  const bodyHits = countPatternMatches(body, INTOXICATION_PATTERNS);

  // Scoring: title evidence is stronger than body mention.
  const score = (titleHits * 2) + bodyHits;

  // Strict gate to avoid generic EM updates:
  // - any direct intoxication term in title, OR
  // - repeated intoxication evidence in body.
  return titleHits >= 1 || score >= 3;
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }

  return String(value).trim();
}

function getEnvInt(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}

function getUpdateMode(value) {
  const normalized = normalizeText(value || "moderate");
  if (normalized === "1" || normalized === "conservative") {
    return "conservative";
  }

  if (normalized === "3" || normalized === "advanced") {
    return "advanced";
  }

  return "moderate";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "tox-radar/1.0"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`timeout apos ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseFeedWithRetry(parser, feedUrl) {
  const totalAttempts = FEED_MAX_RETRIES + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      const xml = await fetchWithTimeout(feedUrl, FEED_TIMEOUT_MS);
      return await parser.parseString(xml);
    } catch (error) {
      if (attempt >= totalAttempts) {
        throw error;
      }

      const delayMs = FEED_RETRY_DELAY_MS * attempt;
      console.warn(
        `[feed-retry] ${feedUrl} falhou na tentativa ${attempt}/${totalAttempts} (${error.message}). Tentando novamente em ${delayMs}ms.`
      );
      await delay(delayMs);
    }
  }

  throw new Error("Falha inesperada ao processar feed");
}

function getSourceName(feed, feedUrl) {
  if (feed && feed.title && String(feed.title).trim()) {
    return String(feed.title).trim();
  }

  try {
    return new URL(feedUrl).hostname.replace(/^www\./, "");
  } catch (_error) {
    return feedUrl;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function compactWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getItemText(item) {
  return compactWhitespace([
    item.title,
    item.contentSnippet,
    item.content,
    item.summary,
    item["content:encoded"]
  ].join(" "));
}

function toWordRegex(term) {
  const escaped = String(term || "")
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");

  if (!escaped) {
    return null;
  }

  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
}

function inferUpdateScope(articleText) {
  const text = normalizeText(articleText);

  if (/\b(antidote|flumazenil|n[-\s]?acetylcysteine|acetilcisteina|naloxone|fomepizole)\b/.test(text)) {
    return "antidoto e conduta";
  }

  if (/\b(dose|mg\/kg|toxic dose|threshold|limiar)\b/.test(text)) {
    return "dose toxica e limiar";
  }

  if (/\b(half[-\s]?life|meia[-\s]?vida|pharmacokinetic|farmacocinetica)\b/.test(text)) {
    return "dados farmacocineticos";
  }

  return "notas clinicas e referencia";
}

function getUpdateModeLabel() {
  if (UPDATE_MODE === "advanced") {
    return "modo 3 (avancado com revisao)";
  }

  if (UPDATE_MODE === "conservative") {
    return "modo 1 (conservador)";
  }

  return "modo 2 (moderado)";
}

async function fetchDrugCatalog(supabase) {
  const { data, error } = await supabase
    .from("drugs")
    .select("slug,name,synonyms,notes,guideline_ref")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Falha ao carregar catalogo de drogas: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

function extractSuggestionSnippet(itemText, drug) {
  const compact = compactWhitespace(itemText);
  if (!compact) {
    return null;
  }

  const sentences = compact
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => compactWhitespace(sentence))
    .filter((sentence) => sentence.length >= 20);

  const terms = [drug.name, ...(Array.isArray(drug.synonyms) ? drug.synonyms : [])]
    .map((term) => normalizeText(term))
    .filter((term) => term.length >= 4);

  const toxicClues = ["overdose", "intoxic", "poison", "toxic", "antidote", "toxidrome", "mg/kg"];

  for (const sentence of sentences) {
    const normalized = normalizeText(sentence);
    const hasDrugTerm = terms.some((term) => normalized.includes(term));
    const hasToxicClue = toxicClues.some((clue) => normalized.includes(clue));

    if (hasDrugTerm && hasToxicClue) {
      return sentence.slice(0, 280);
    }
  }

  return sentences.length ? sentences[0].slice(0, 280) : null;
}

function buildReviewSuggestion(itemText, article, drug, updateScope) {
  const normalized = normalizeText(itemText);
  const hasSymptoms = /\b(symptom|presentation|toxidrome|clinical|manifest|sinais|sintoma|neurolog|cardio|respirat|coma|convuls|arritm|qrs)\b/.test(normalized);
  const hasTreatment = /\b(treatment|management|therapy|antidote|decontamination|charcoal|lavage|naloxone|flumazenil|acetylcysteine|acetilcisteina|fomepizole|suporte)\b/.test(normalized);

  const focus = ["substancia"];
  if (hasSymptoms) {
    focus.push("sintomatologia");
  }
  if (hasTreatment) {
    focus.push("tratamento");
  }

  const suggestedAlertMessage = `Revisar ${focus.join(", ")} para ${drug.name} com base em publicacao FOAMed. Confirmar se ha ajuste no alerta clinico e risco toxicologico.`;

  const suggestedClinicalPresentation = `Atualizacao sugerida em portugues para ${drug.name} (${updateScope}): revisar apresentacao clinica e condutas terapeuticas aplicaveis. Fonte FOAMed: ${article.source}.`;

  return {
    suggestedAlertMessage,
    suggestedClinicalPresentation
  };
}

async function queueReviewSuggestion(supabase, payload) {
  const { error } = await supabase
    .from("tox_radar_review_queue")
    .upsert(
      {
        drug_slug: payload.drugSlug,
        drug_name: payload.drugName,
        article_url: payload.articleUrl,
        article_title: payload.articleTitle,
        source: payload.source,
        update_scope: payload.updateScope,
        suggested_alert_message: payload.suggestedAlertMessage,
        suggested_clinical_presentation: payload.suggestedClinicalPresentation,
        status: "pending"
      },
      { onConflict: "drug_slug,article_url" }
    );

  if (error) {
    if (isTableNotInCacheError(error)) {
      console.warn(`[warn] Fila de revisao indisponivel; sugestao nao enfileirada para ${payload.drugSlug}.`);
      return false;
    }

    throw new Error(`Falha ao enfileirar sugestao para revisao (${payload.drugSlug}): ${error.message}`);
  }

  return true;
}

function findMentionedDrugs(drugCatalog, itemText) {
  const normalizedText = normalizeText(itemText);
  const matches = [];

  for (const drug of drugCatalog) {
    const terms = [drug.name, ...(Array.isArray(drug.synonyms) ? drug.synonyms : [])]
      .map((term) => compactWhitespace(term))
      .filter((term) => term.length >= 4);

    let found = false;
    for (const term of terms) {
      const regex = toWordRegex(normalizeText(term));
      if (regex && regex.test(normalizedText)) {
        found = true;
        break;
      }
    }

    if (found) {
      matches.push(drug);
    }

    if (matches.length >= MAX_AUTO_UPDATES_PER_ARTICLE) {
      break;
    }
  }

  return matches;
}

async function applyAutoDrugUpdate(supabase, drug, article) {
  const currentNotes = Array.isArray(drug.notes) ? drug.notes : [];

  if (currentNotes.some((note) => String(note || "").includes(article.url))) {
    return false;
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  const newNote = `${timestamp} - ${article.source}: ${article.title} (${article.url})`;
  const nextNotes = [newNote, ...currentNotes].slice(0, MAX_NOTES_PER_DRUG);

  const currentGuideline = compactWhitespace(drug.guideline_ref);
  const sourceTag = `FOAMed:${article.source}`;
  const nextGuidelineRef = currentGuideline
    ? (currentGuideline.includes(sourceTag) ? currentGuideline : `${currentGuideline} | ${sourceTag}`)
    : sourceTag;

  const updatePayload = {
    notes: nextNotes
  };

  if (UPDATE_MODE !== "conservative") {
    updatePayload.guideline_ref = nextGuidelineRef;
  }

  const { error } = await supabase.from("drugs").update(updatePayload).eq("slug", drug.slug);

  if (error) {
    throw new Error(`Falha ao atualizar droga ${drug.slug}: ${error.message}`);
  }

  return true;
}

async function sendDrugUpdatedTelegramNotice(token, chatId, payload) {
  const reviewLine = payload.reviewQueued
    ? "<b>Revisao pendente:</b> sugestoes para alert_message e clinical_presentation foram enfileiradas."
    : "";

  const text = [
    "<b>TOX Radar Update</b>",
    "",
    `substancia <b>${escapeHtml(payload.drugName)}</b> atualizada em <b>${escapeHtml(payload.updateScope)}</b>`,
    `<b>Modo:</b> ${escapeHtml(getUpdateModeLabel())}`,
    `<b>Fonte:</b> ${escapeHtml(payload.source)}`,
    `<b>Artigo:</b> ${escapeHtml(payload.title)}`,
    `<b>Link:</b> <a href=\"${payload.url}\">Abrir artigo</a>`,
    reviewLine
  ].join("\n");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Erro ao enviar update de substancia no Telegram: HTTP ${response.status} - ${body}`);
  }
}

async function isUrlAlreadySent(supabase, url) {
  if (runtimeSentUrls.has(url)) {
    return true;
  }

  const { data, error } = await supabase
    .from("tox_alerts_sent")
    .select("url")
    .eq("url", url)
    .limit(1);

  if (error) {
    if (isTableNotInCacheError(error)) {
      // Fallback: keep the bot running even if PostgREST cannot see the table yet.
      console.warn(`[warn] Supabase sem tabela tox_alerts_sent no cache; deduplicacao persistente desativada para esta execucao. URL=${url}`);
      return runtimeSentUrls.has(url);
    }

    throw new Error(`Falha ao consultar Supabase para URL ${url}: ${error.message}`);
  }

  return Array.isArray(data) && data.length > 0;
}

async function markUrlAsSent(supabase, url) {
  const { error } = await supabase.from("tox_alerts_sent").insert({ url });

  if (error) {
    if (isTableNotInCacheError(error)) {
      runtimeSentUrls.add(url);
      return;
    }

    throw new Error(`Falha ao gravar URL no Supabase (${url}): ${error.message}`);
  }

  runtimeSentUrls.add(url);
}

async function sendTelegramAlert(token, chatId, article) {
  const text = [
    "<b>TOX Radar FOAMed</b>",
    "",
    `<b>Titulo:</b> ${escapeHtml(article.title)}`,
    `<b>Fonte:</b> ${escapeHtml(article.source)}`,
    `<b>Link:</b> <a href=\"${article.url}\">Abrir artigo</a>`
  ].join("\n");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Erro ao enviar alerta no Telegram: HTTP ${response.status} - ${body}`);
  }
}

async function processFeed(parser, supabase, telegramToken, chatId, feedUrl, drugCatalog) {
  let feed;
  try {
    feed = await parseFeedWithRetry(parser, feedUrl);
  } catch (error) {
    console.error(`[feed-error] ${feedUrl}: ${error.message}`);
    return { scanned: 0, matched: 0, sent: 0 };
  }

  const source = getSourceName(feed, feedUrl);
  const items = Array.isArray(feed.items) ? feed.items : [];

  let matched = 0;
  let sent = 0;
  let autoUpdated = 0;

  for (const item of items) {
    const url = item.link || item.guid;
    if (!url) {
      continue;
    }

    if (!isRelevantIntoxicationContent(item)) {
      continue;
    }

    matched += 1;

    const alreadySent = await isUrlAlreadySent(supabase, url);
    if (alreadySent) {
      continue;
    }

    const title = item.title || "(Sem titulo)";

    const article = {
      title,
      source,
      url
    };

    const itemText = getItemText(item);
    const updateScope = inferUpdateScope(itemText);
    const mentionedDrugs = findMentionedDrugs(drugCatalog, itemText);

    for (const drug of mentionedDrugs) {
      try {
        const updated = await applyAutoDrugUpdate(supabase, drug, article);
        if (!updated) {
          continue;
        }

        let reviewQueued = false;
        if (UPDATE_MODE === "advanced") {
          const suggestion = buildReviewSuggestion(itemText, article, drug, updateScope);
          reviewQueued = await queueReviewSuggestion(supabase, {
            drugSlug: drug.slug,
            drugName: drug.name,
            articleUrl: article.url,
            articleTitle: article.title,
            source: article.source,
            updateScope,
            suggestedAlertMessage: suggestion.suggestedAlertMessage,
            suggestedClinicalPresentation: suggestion.suggestedClinicalPresentation
          });
        }

        await sendDrugUpdatedTelegramNotice(telegramToken, chatId, {
          drugName: drug.name,
          updateScope,
          source,
          title,
          url,
          reviewQueued
        });

        autoUpdated += 1;
        console.log(`[auto-update] ${drug.slug} atualizado em ${updateScope}`);
      } catch (error) {
        console.error(`[auto-update-error] ${drug.slug}: ${error.message}`);
      }
    }

    await sendTelegramAlert(telegramToken, chatId, {
      title,
      source,
      url
    });

    await markUrlAsSent(supabase, url);
    sent += 1;

    console.log(`[sent] ${source} :: ${title}`);
  }

  return { scanned: items.length, matched, sent, autoUpdated };
}

async function main() {
  const parser = new Parser();

  const supabase = createClient(
    getRequiredEnv("SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );

  const telegramToken = getRequiredEnv("TELEGRAM_BOT_TOKEN");
  const telegramChatId = getRequiredEnv("TELEGRAM_CHAT_ID");
  const drugCatalog = await fetchDrugCatalog(supabase);

  const totals = { scanned: 0, matched: 0, sent: 0, autoUpdated: 0 };

  for (const feedUrl of FEEDS) {
    const stats = await processFeed(parser, supabase, telegramToken, telegramChatId, feedUrl, drugCatalog);
    totals.scanned += stats.scanned;
    totals.matched += stats.matched;
    totals.sent += stats.sent;
    totals.autoUpdated += stats.autoUpdated || 0;
  }

  console.log(
    `Concluido: ${totals.scanned} itens analisados, ${totals.matched} candidatos em toxicologia, ${totals.sent} alertas novos enviados, ${totals.autoUpdated} substancias atualizadas.`
  );
}

main().catch((error) => {
  console.error("Erro fatal no tox-radar:", error.message);
  process.exit(1);
});
