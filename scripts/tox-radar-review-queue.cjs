#!/usr/bin/env node
require("dotenv").config();
require("dotenv").config({ path: ".env.local", override: false });

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
  "https://www.thebottomline.org.uk/feed/",
];

const MAX_ITEMS_PER_FEED = parseEnvInt("TOX_RADAR_QUEUE_MAX_ITEMS_PER_FEED", 10, 1, 50);
const MAX_DRUGS_PER_ARTICLE = parseEnvInt("TOX_RADAR_QUEUE_MAX_DRUGS_PER_ARTICLE", 3, 1, 10);
const FEED_TIMEOUT_MS = parseEnvInt("TOX_RADAR_QUEUE_FEED_TIMEOUT_MS", 12000, 1000, 120000);
const FEED_MAX_RETRIES = parseEnvInt("TOX_RADAR_QUEUE_FEED_MAX_RETRIES", 2, 0, 5);
const FEED_RETRY_DELAY_MS = parseEnvInt("TOX_RADAR_QUEUE_FEED_RETRY_DELAY_MS", 1500, 0, 60000);

function parseEnvInt(name, fallback, min, max) {
  const raw = process.env[name];
  if (!raw || !String(raw).trim()) return fallback;
  const num = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function getEnv(name, fallback = "") {
  const val = process.env[name];
  if (val && String(val).trim()) return String(val).trim();
  return fallback;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function compactWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toWordRegex(term) {
  const escaped = String(term || "")
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");

  if (!escaped) return null;
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
}

function getSourceName(feed, feedUrl) {
  if (feed && feed.title && String(feed.title).trim()) {
    return String(feed.title).trim();
  }

  try {
    return new URL(feedUrl).hostname.replace(/^www\./, "");
  } catch {
    return feedUrl;
  }
}

function getItemText(item) {
  return compactWhitespace([
    item.title,
    item.contentSnippet,
    item.content,
    item.summary,
    item["content:encoded"],
  ].join(" "));
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

function detectSuggestionAxes(articleText) {
  const text = normalizeText(articleText);

  const hasSubstance = /\b(drug|toxin|veneno|intoxic|poison|dose|mg\/kg|threshold|limiar|half[-\s]?life|meia[-\s]?vida)\b/.test(text);
  const hasSymptoms = /\b(symptom|presentation|toxidrome|clinical|manifest|sinais|sintoma|neurolog|cardio|respirat|coma|convuls|arritm|qrs)\b/.test(text);
  const hasTreatment = /\b(treatment|management|therapy|antidote|decontamination|charcoal|lavage|naloxone|flumazenil|acetylcysteine|acetilcisteina|fomepizole|suporte)\b/.test(text);

  return {
    substance: hasSubstance,
    symptoms: hasSymptoms,
    treatment: hasTreatment,
  };
}

function buildPortugueseSuggestions(drug, article, articleText) {
  const axes = detectSuggestionAxes(articleText);
  const topics = [];

  if (axes.substance) {
    topics.push(`substancia ${drug.name}`);
  }

  if (axes.symptoms) {
    topics.push("sintomatologia e apresentacao clinica");
  }

  if (axes.treatment) {
    topics.push("tratamento e condutas");
  }

  if (!topics.length) {
    topics.push("atualizacao clinica geral");
  }

  const suggestedAlertMessage = `Revisar ${topics.join(", ")} para ${drug.name} com base em publicacao FOAMed recente. Validar impacto no alerta clinico e risco toxicologico.`;

  const suggestedClinicalPresentation = `Sugestao de revisao em portugues: atualizar texto de apresentacao clinica e tratamento de ${drug.name}, incluindo sinais/sintomas relevantes e condutas praticas quando aplicavel. Fonte FOAMed: ${article.source}.`;

  return {
    suggestedAlertMessage,
    suggestedClinicalPresentation,
  };
}

function extractSuggestionSnippet(itemText, drug) {
  const compact = compactWhitespace(itemText);
  if (!compact) return null;

  const sentences = compact
    .split(/(?<=[.!?])\s+/)
    .map((s) => compactWhitespace(s))
    .filter((s) => s.length >= 20);

  const terms = [drug.name, ...(Array.isArray(drug.synonyms) ? drug.synonyms : [])]
    .map((term) => normalizeText(term))
    .filter((term) => term.length >= 4);

  const clues = ["overdose", "intoxic", "poison", "toxic", "antidote", "toxidrome", "mg/kg"];

  for (const sentence of sentences) {
    const normalized = normalizeText(sentence);
    const hasDrug = terms.some((term) => normalized.includes(term));
    const hasClue = clues.some((clue) => normalized.includes(clue));
    if (hasDrug && hasClue) {
      return sentence.slice(0, 280);
    }
  }

  return sentences.length ? sentences[0].slice(0, 280) : null;
}

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
    (combined.includes("relation") && combined.includes("does not exist"))
  );
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
        "user-agent": "tox-radar-queue/1.0",
      },
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

async function fetchDrugCatalog(supabase) {
  const { data, error } = await supabase
    .from("drugs")
    .select("slug,name,synonyms")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Falha ao carregar catalogo de drogas: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
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

    if (matches.length >= MAX_DRUGS_PER_ARTICLE) {
      break;
    }
  }

  return matches;
}

async function loadKnownUrls(supabase) {
  const known = new Set();
  let canWriteAlertsSent = true;

  const { data: queueData, error: queueError } = await supabase
    .from("tox_radar_review_queue")
    .select("article_url")
    .limit(5000);

  if (queueError) {
    throw new Error(`Falha ao ler tox_radar_review_queue: ${queueError.message}`);
  }

  for (const row of queueData || []) {
    const url = String(row.article_url || "").trim();
    if (url) known.add(url);
  }

  const { data: sentData, error: sentError } = await supabase
    .from("tox_alerts_sent")
    .select("url")
    .limit(5000);

  if (sentError) {
    if (isTableNotInCacheError(sentError)) {
      canWriteAlertsSent = false;
      console.warn("[warn] tabela tox_alerts_sent ausente no schema cache; deduplicacao usara apenas review_queue.");
    } else {
      throw new Error(`Falha ao ler tox_alerts_sent: ${sentError.message}`);
    }
  } else {
    for (const row of sentData || []) {
      const url = String(row.url || "").trim();
      if (url) known.add(url);
    }
  }

  return { knownUrls: known, canWriteAlertsSent };
}

async function queueSuggestion(supabase, payload) {
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
        status: "pending",
      },
      { onConflict: "drug_slug,article_url" }
    );

  if (error) {
    throw new Error(`Falha ao enfileirar ${payload.drugSlug}: ${error.message}`);
  }
}

async function markSent(supabase, url, enabled) {
  if (!enabled) return;

  const { error } = await supabase.from("tox_alerts_sent").insert({ url });
  if (error && !isTableNotInCacheError(error)) {
    throw new Error(`Falha ao gravar tox_alerts_sent (${url}): ${error.message}`);
  }
}

async function processFeed(supabase, parser, feedUrl, drugCatalog, state) {
  let feed;
  try {
    feed = await parseFeedWithRetry(parser, feedUrl);
  } catch (error) {
    console.warn(`[feed-error] ${feedUrl}: ${error.message}`);
    return { scanned: 0, queued: 0, newUrls: 0 };
  }

  const source = getSourceName(feed, feedUrl);
  const items = Array.isArray(feed.items) ? feed.items.slice(0, MAX_ITEMS_PER_FEED) : [];

  let queued = 0;
  let newUrls = 0;

  for (const item of items) {
    const articleUrl = String(item.link || item.guid || "").trim();
    if (!articleUrl || state.knownUrls.has(articleUrl)) {
      continue;
    }

    newUrls += 1;

    const articleTitle = compactWhitespace(item.title || "Sem titulo");
    const itemText = getItemText(item);
    const updateScope = inferUpdateScope(itemText);
    const mentioned = findMentionedDrugs(drugCatalog, itemText);

    for (const drug of mentioned) {
      const suggestions = buildPortugueseSuggestions(
        drug,
        { title: articleTitle, source, url: articleUrl },
        itemText
      );

      await queueSuggestion(supabase, {
        drugSlug: drug.slug,
        drugName: drug.name,
        articleUrl,
        articleTitle,
        source,
        updateScope,
        suggestedAlertMessage: suggestions.suggestedAlertMessage,
        suggestedClinicalPresentation: suggestions.suggestedClinicalPresentation,
      });

      queued += 1;
    }

    await markSent(supabase, articleUrl, state.canWriteAlertsSent);
    state.knownUrls.add(articleUrl);
  }

  return { scanned: items.length, queued, newUrls };
}

async function main() {
  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const parser = new Parser();
  const drugCatalog = await fetchDrugCatalog(supabase);
  const state = await loadKnownUrls(supabase);

  const totals = { feeds: 0, scanned: 0, newUrls: 0, queued: 0 };

  for (const feedUrl of FEEDS) {
    const stats = await processFeed(supabase, parser, feedUrl, drugCatalog, state);
    totals.feeds += 1;
    totals.scanned += stats.scanned;
    totals.newUrls += stats.newUrls;
    totals.queued += stats.queued;
  }

  console.log(
    `[tox-radar-queue] feeds=${totals.feeds} scanned=${totals.scanned} new_urls=${totals.newUrls} queued=${totals.queued}`
  );
}

main().catch((error) => {
  console.error("[tox-radar-queue] erro fatal:", error.message);
  process.exit(1);
});
