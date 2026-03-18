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

function hasStrongToxicologyContext(articleTitle, articleText) {
  const text = normalizeText(`${articleTitle || ""} ${articleText || ""}`);
  const clinicalTox = /\b(intoxic|overdose|poison|toxic|toxidrome|veneno|envenen|ingestion|ingestao|exposure|exposicao)\b/;
  const management = /\b(antidote|naloxone|flumazenil|fomepizole|acetylcysteine|acetilcisteina|charcoal|carvao|lavage|lavagem|decontamination|descontamin)\b/;
  const objectiveData = /\b(mg\/kg|dose|threshold|limiar|half\s*life|meia\s*vida|qrs|qt|arrhythm|convuls|coma)\b/;

  return clinicalTox.test(text) || (management.test(text) && objectiveData.test(text));
}

function buildTopicSignals(articleTitle, articleText) {
  const text = normalizeText(`${articleTitle || ""} ${articleText || ""}`);
  const signals = [];

  const candidates = [
    { regex: /thyrotoxicosis|thyroid\s+storm/, label: "tempestade tireotoxica e descompensacao endocrina" },
    { regex: /recognition|diagnosis|diagnostic/, label: "criterios de reconhecimento diagnostico" },
    { regex: /management|tratamento|therapy|therapeutic/, label: "estrategias de manejo terapeutico" },
    { regex: /arrhythm|qrs|tachycard|bradycard/, label: "manifestacoes cardiovasculares" },
    { regex: /seizure|convuls/, label: "risco de convulsao" },
    { regex: /coma|mental\s+status|conscious/, label: "alteracao do estado neurologico" },
    { regex: /antidote|naloxone|flumazenil|fomepizole|acetylcysteine|acetilcisteina/, label: "uso de antidoto especifico" },
    { regex: /charcoal|carvao/, label: "indicacao de carvao ativado" },
    { regex: /lavage|lavagem/, label: "criterios de lavagem gastrica" },
    { regex: /dose|mg\/kg|threshold|limiar/, label: "ajuste de limiar de dose toxica" },
    { regex: /half\s*life|meia\s*vida|pharmacokinetic|farmacocinet/, label: "dados farmacocineticos e meia-vida" },
  ];

  for (const candidate of candidates) {
    if (candidate.regex.test(text)) {
      signals.push(candidate.label);
    }
  }

  return Array.from(new Set(signals)).slice(0, 4);
}

function classifyEvidenceSentence(sentence) {
  const normalized = normalizeText(sentence);
  const tags = [];

  if (/\b(mg\/kg|dose|threshold|limiar|half\s*life|meia\s*vida|pharmacokinetic|farmacocinet)\b/.test(normalized)) {
    tags.push("substancia");
  }
  if (/\b(symptom|presentation|toxidrome|clinical|manifest|sinais|sintoma|neurolog|cardio|respirat|coma|convuls|arrithm|arrhythm|qrs|qt)\b/.test(normalized)) {
    tags.push("sintomatologia");
  }
  if (/\b(treatment|management|therapy|antidote|decontamination|charcoal|lavage|naloxone|flumazenil|acetylcysteine|acetilcisteina|fomepizole|suporte)\b/.test(normalized)) {
    tags.push("tratamento");
  }

  const hasClinicalTox = /\b(intoxic|overdose|poison|toxic|toxidrome|veneno|envenen)\b/.test(normalized);
  const hasObjective = /\b(\d+\s*mg\/kg|\d+\s*mg|dose|threshold|limiar|qrs|qt|half\s*life|meia\s*vida|naloxone|flumazenil|fomepizole|acetylcysteine|acetilcisteina)\b/.test(normalized);

  return {
    tags,
    isStrong: hasClinicalTox && hasObjective,
  };
}

function buildEvidencePack(drug, itemText) {
  const compact = compactWhitespace(itemText);
  if (!compact) {
    return { lines: [], tags: new Set() };
  }

  const sentences = compact
    .split(/(?<=[.!?])\s+/)
    .map((s) => compactWhitespace(s))
    .filter((s) => s.length >= 35);

  const terms = [drug.name, ...(Array.isArray(drug.synonyms) ? drug.synonyms : [])]
    .map((term) => normalizeText(term))
    .filter((term) => term.length >= 4);

  const selected = [];
  const tagSet = new Set();

  for (const sentence of sentences) {
    const normalized = normalizeText(sentence);
    const mentionsDrug = terms.some((term) => normalized.includes(term));
    if (!mentionsDrug) continue;

    const classification = classifyEvidenceSentence(sentence);
    if (!classification.isStrong && classification.tags.length === 0) {
      continue;
    }

    for (const tag of classification.tags) {
      tagSet.add(tag);
    }

    selected.push(sentence.slice(0, 280));
    if (selected.length >= 3) {
      break;
    }
  }

  return {
    lines: selected,
    tags: tagSet,
  };
}

function findFirstEvidenceLine(evidenceLines, regex) {
  return evidenceLines.find((line) => regex.test(line)) || null;
}

function setFieldIfValue(target, key, value) {
  if (value == null) {
    return;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized) {
      target[key] = normalized;
    }
    return;
  }

  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      target[key] = value;
    }
    return;
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
    if (normalized.length) {
      target[key] = normalized;
    }
    return;
  }

  if (typeof value === "object") {
    const cleaned = {};
    for (const [objKey, objValue] of Object.entries(value)) {
      if (objValue == null) continue;
      const asString = String(objValue).trim();
      if (asString) {
        cleaned[objKey] = asString;
      }
    }

    if (Object.keys(cleaned).length) {
      target[key] = cleaned;
    }
  }
}

function extractDoseFromText(articleText) {
  const compact = compactWhitespace(articleText);
  if (!compact) {
    return { text: null, value: null, unit: null };
  }

  const targeted = compact.match(/(?:toxic(?:\s+dose)?|dose\s+toxica|letal|threshold|limiar)[^.;:\n]{0,90}?(\d+(?:[.,]\d+)?)\s*(mg\/kg|g\/kg|mcg\/kg|ug\/kg|mg|g)/i);
  const generic = compact.match(/(\d+(?:[.,]\d+)?)\s*(mg\/kg|g\/kg|mcg\/kg|ug\/kg)/i);
  const match = targeted || generic;

  if (!match) {
    return { text: null, value: null, unit: null };
  }

  const rawValue = String(match[1]).replace(",", ".");
  const value = Number.parseFloat(rawValue);
  const unit = String(match[2] || "").trim().toLowerCase();

  if (!Number.isFinite(value) || !unit) {
    return { text: null, value: null, unit: null };
  }

  return {
    text: `> ${value} ${unit}`,
    value,
    unit,
  };
}

function extractHalfLifeText(articleText, evidenceLines) {
  const compact = compactWhitespace(articleText);
  const direct = compact.match(/(?:half\s*life|meia\s*vida)[^.;:\n]{0,80}(\d+(?:[.,]\d+)?\s*(?:h|hr|hrs|hour|hours|hora|horas|min|mins|minuto|minutos))/i);
  if (direct) {
    return compactWhitespace(direct[0]).slice(0, 180);
  }

  const evidence = findFirstEvidenceLine(evidenceLines, /half\s*life|meia\s*vida/i);
  return evidence ? evidence.slice(0, 180) : null;
}

function extractAntidoteInfo(articleText, evidenceLines) {
  const compact = compactWhitespace(articleText);
  const antidoteMap = [
    { regex: /naloxone/i, name: "Naloxona" },
    { regex: /flumazenil/i, name: "Flumazenil" },
    { regex: /fomepizole/i, name: "Fomepizol" },
    { regex: /acetylcysteine|acetilcisteina|n-acetylcysteine|nac/i, name: "N-acetilcisteína" },
    { regex: /hydroxocobalamin|hidroxocobalamina/i, name: "Hidroxocobalamina" },
    { regex: /atropine|atropina/i, name: "Atropina" },
    { regex: /pralidoxime|pralidoxima/i, name: "Pralidoxima" },
    { regex: /digoxin immune fab|digifab|fab/i, name: "Fab antidigoxina" },
  ];

  const antidote = antidoteMap.find((item) => item.regex.test(compact));
  if (!antidote) {
    return null;
  }

  const indication =
    findFirstEvidenceLine(evidenceLines, /antidote|naloxone|flumazenil|fomepizole|acetylcysteine|acetilcisteina|indicat|indica/i) ||
    findFirstEvidenceLine(evidenceLines, /treatment|management|therapy|tratamento|manejo/i);

  const dose =
    findFirstEvidenceLine(evidenceLines, /naloxone|flumazenil|fomepizole|acetylcysteine|acetilcisteina|\d+\s*(mg|mcg|g|ml|mL)/i) ||
    findFirstEvidenceLine(evidenceLines, /dose|bolus|infus/i);

  return {
    name: antidote.name,
    indication: indication ? indication.slice(0, 240) : null,
    dose: dose ? dose.slice(0, 240) : null,
  };
}

function buildPortugueseSuggestions(drug, article, articleText) {
  if (!hasStrongToxicologyContext(article.title, articleText)) {
    return null;
  }

  const axes = detectSuggestionAxes(articleText);
  const evidence = buildEvidencePack(drug, articleText);
  if (!evidence.lines.length) {
    return null;
  }

  const compactTitle = compactWhitespace(article.title || "Publicacao sem titulo");
  const signals = buildTopicSignals(article.title, articleText);
  const foamedLabel = `FOAMed ${article.source}`;
  const headlineEvidence = evidence.lines[0];
  const doseInfo = extractDoseFromText(articleText);
  const halfLife = extractHalfLifeText(articleText, evidence.lines);
  const antidote = extractAntidoteInfo(articleText, evidence.lines);

  const clinicalEvidence =
    findFirstEvidenceLine(evidence.lines, /toxidrome|clinical|manifest|sinais|sintoma|neurolog|cardio|respirat|coma|convuls|arrithm|arrhythm|qrs|qt/i) ||
    headlineEvidence;

  const treatmentEvidence =
    findFirstEvidenceLine(evidence.lines, /treatment|management|therapy|tratamento|manejo|antidote|naloxone|flumazenil|fomepizole|acetylcysteine|acetilcisteina/i) ||
    headlineEvidence;
  const charcoalEvidence = findFirstEvidenceLine(evidence.lines, /charcoal|carvao/i);
  const lavageEvidence = findFirstEvidenceLine(evidence.lines, /lavage|lavagem/i);

  const suggestedAlertMessage = `Atualizar alerta (${foamedLabel}): ${headlineEvidence}. Fonte: ${compactTitle} (${article.url}).`;

  const suggestedClinicalPresentation = `Atualizar apresentacao clinica (${foamedLabel}): ${clinicalEvidence}.`;

  const proposedFields = {};
  setFieldIfValue(proposedFields, "alert_message", suggestedAlertMessage);
  setFieldIfValue(proposedFields, "clinical_presentation", suggestedClinicalPresentation);
  setFieldIfValue(proposedFields, "guideline_ref", `FOAMed:${article.source}`);
  setFieldIfValue(proposedFields, "toxic_dose_text", doseInfo.text);
  setFieldIfValue(proposedFields, "toxic_dose_value", doseInfo.value);
  setFieldIfValue(proposedFields, "toxic_dose_unit", doseInfo.unit);
  setFieldIfValue(proposedFields, "half_life", halfLife);

  if (axes.treatment && evidence.tags.has("tratamento")) {
    setFieldIfValue(proposedFields, "treatment", [`Tratamento inicial sugerido: ${treatmentEvidence}`]);
  }

  if (charcoalEvidence) {
    setFieldIfValue(proposedFields, "activated_charcoal", "conditional");
  }

  if (lavageEvidence) {
    setFieldIfValue(proposedFields, "lavage", "not-routine");
  }

  if (axes.treatment && evidence.tags.has("tratamento")) {
    setFieldIfValue(
      proposedFields,
      "supportive_care",
      `Suporte clinico inicial: monitorizacao, estabilizacao ABC e reavaliacao seriada com base em ${compactTitle}.`
    );
  }

  setFieldIfValue(proposedFields, "antidote", antidote);
  setFieldIfValue(proposedFields, "notes", [
    `Fonte ${foamedLabel}: ${article.title} (${article.url}).`,
    ...evidence.lines.map((line, index) => `Evidencia ${index + 1}: ${line}`),
  ]);

  const aspectSuggestions = {};
  if (doseInfo.text) {
    aspectSuggestions.dose_toxica = doseInfo.text;
  }
  if (halfLife) {
    aspectSuggestions.meia_vida = halfLife;
  }
  if (clinicalEvidence) {
    aspectSuggestions.apresentacao_clinica = clinicalEvidence;
  }
  if (axes.treatment && evidence.tags.has("tratamento")) {
    aspectSuggestions.tratamento_inicial = treatmentEvidence;
  }
  if (charcoalEvidence) {
    aspectSuggestions.carvao_ativado = `Carvao ativado: condicional. Evidencia: ${charcoalEvidence}`;
  }
  if (lavageEvidence) {
    aspectSuggestions.lavagem_gastrica = `Lavagem gastrica: nao rotineira. Evidencia: ${lavageEvidence}`;
  }
  if (proposedFields.supportive_care) {
    aspectSuggestions.suporte_clinico = String(proposedFields.supportive_care);
  }
  if (antidote?.name) {
    aspectSuggestions.antidoto = antidote.name;
  }
  if (antidote?.indication) {
    aspectSuggestions.indicacao_antidoto = antidote.indication;
  }
  if (antidote?.dose) {
    aspectSuggestions.dose_antidoto = antidote.dose;
  }
  aspectSuggestions.referencia = `${article.title} (${article.url})`;

  if (axes.substance && evidence.tags.has("substancia")) {
    aspectSuggestions.substancia = `Atualizar secao da substancia (${foamedLabel}) com base em dado objetivo: ${evidence.lines.find((line) => /mg\/kg|dose|threshold|limiar|half\s*life|meia\s*vida|pharmacokinetic|farmacocinet/i.test(line)) || headlineEvidence}.`;
  }
  if (axes.symptoms && evidence.tags.has("sintomatologia")) {
    aspectSuggestions.sintomatologia = `Adicionar na sintomatologia (${foamedLabel}) com base na evidencia: ${evidence.lines.find((line) => /toxidrome|clinical|manifest|sinais|sintoma|neurolog|cardio|respirat|coma|convuls|arrithm|arrhythm|qrs|qt/i.test(line)) || headlineEvidence}.`;
  }
  if (axes.treatment && evidence.tags.has("tratamento")) {
    aspectSuggestions.tratamento = `Adicionar no tratamento (${foamedLabel}) com conduta concreta da fonte: ${evidence.lines.find((line) => /antidote|naloxone|flumazenil|fomepizole|acetylcysteine|acetilcisteina|charcoal|carvao|lavage|lavagem|treatment|management/i.test(line)) || headlineEvidence}.`;
  }

  const suggestedUpdatePayload = {
    language: "pt-BR",
    checklist_order: [
      "toxic_dose_text",
      "toxic_dose_value",
      "toxic_dose_unit",
      "half_life",
      "guideline_ref",
      "clinical_presentation",
      "treatment",
      "activated_charcoal",
      "lavage",
      "supportive_care",
      "antidote",
      "notes",
    ],
    proposed_fields: proposedFields,
    aspect_suggestions: aspectSuggestions,
    evidence_lines: evidence.lines,
  };

  return {
    suggestedAlertMessage,
    suggestedClinicalPresentation,
    suggestedUpdatePayload,
  };
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
  const basePayload = {
    drug_slug: payload.drugSlug,
    drug_name: payload.drugName,
    article_url: payload.articleUrl,
    article_title: payload.articleTitle,
    source: payload.source,
    update_scope: payload.updateScope,
    suggested_alert_message: payload.suggestedAlertMessage,
    suggested_clinical_presentation: payload.suggestedClinicalPresentation,
    status: "pending",
  };

  const { error } = await supabase
    .from("tox_radar_review_queue")
    .upsert(
      {
        ...basePayload,
        suggested_update_payload: payload.suggestedUpdatePayload,
      },
      { onConflict: "drug_slug,article_url" }
    );

  if (error) {
    const msg = String(error.message || "").toLowerCase();
    const missingPayloadColumn = msg.includes("suggested_update_payload") && msg.includes("does not exist");

    if (missingPayloadColumn) {
      const { error: fallbackError } = await supabase
        .from("tox_radar_review_queue")
        .upsert(basePayload, { onConflict: "drug_slug,article_url" });

      if (!fallbackError) {
        console.warn("[warn] coluna suggested_update_payload ausente; sugestao salva no formato legado.");
        return;
      }

      throw new Error(`Falha ao enfileirar ${payload.drugSlug} (fallback): ${fallbackError.message}`);
    }

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

      if (!suggestions) {
        continue;
      }

      await queueSuggestion(supabase, {
        drugSlug: drug.slug,
        drugName: drug.name,
        articleUrl,
        articleTitle,
        source,
        updateScope,
        suggestedAlertMessage: suggestions.suggestedAlertMessage,
        suggestedClinicalPresentation: suggestions.suggestedClinicalPresentation,
        suggestedUpdatePayload: suggestions.suggestedUpdatePayload,
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

if (require.main === module) {
  main().catch((error) => {
    console.error("[tox-radar-queue] erro fatal:", error.message);
    process.exit(1);
  });
}

module.exports = {
  buildPortugueseSuggestions,
  compactWhitespace,
  fetchDrugCatalog,
  fetchWithTimeout,
  getSourceName,
  inferUpdateScope,
};
