#!/usr/bin/env node
require("dotenv").config();
require("dotenv").config({ path: ".env.local", override: false });

const { createClient } = require("@supabase/supabase-js");
const {
  buildPortugueseSuggestions,
  compactWhitespace,
  fetchDrugCatalog,
  fetchWithTimeout,
  inferUpdateScope,
} = require("./tox-radar-review-queue.cjs");

const BACKFILL_LIMIT = parseEnvInt("TOX_RADAR_BACKFILL_LIMIT", 200, 1, 2000);
const FETCH_TIMEOUT_MS = parseEnvInt("TOX_RADAR_BACKFILL_FETCH_TIMEOUT_MS", 12000, 1000, 120000);

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

function htmlToText(html) {
  return compactWhitespace(
    String(html || "")
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
  );
}

async function fetchPendingQueueItems(supabase) {
  const { data, error } = await supabase
    .from("tox_radar_review_queue")
    .select("id,drug_slug,drug_name,article_url,article_title,source,status,suggested_alert_message,suggested_clinical_presentation,suggested_update_payload")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BACKFILL_LIMIT);

  if (error) {
    throw new Error(`Falha ao carregar pendentes da fila: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

function buildFallbackArticleTextFromQueue(item) {
  const payloadText = item.suggested_update_payload ? JSON.stringify(item.suggested_update_payload) : "";

  return compactWhitespace([
    item.article_title,
    item.suggested_alert_message,
    item.suggested_clinical_presentation,
    payloadText,
  ].join(" "));
}

function isLegacyGenericSentence(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return true;

  return (
    /^sem\b/.test(normalized) ||
    normalized.includes("incluir no alerta") ||
    normalized.includes("adicionar na apresentacao") ||
    normalized.includes("adicionar no suporte clinico") ||
    normalized.includes("adicionar no tratamento") ||
    normalized.includes("atualizar secao da substancia") ||
    normalized.includes("aplicar no cadastro") ||
    normalized.includes("condutas para")
  );
}

function pruneObjectEntries(input) {
  const out = {};
  if (!input || typeof input !== "object") {
    return out;
  }

  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue;

    if (typeof value === "string") {
      const normalized = value.trim();
      if (!normalized) continue;
      if (isLegacyGenericSentence(normalized)) continue;
      out[key] = normalized;
      continue;
    }

    if (typeof value === "number") {
      if (Number.isFinite(value)) {
        out[key] = value;
      }
      continue;
    }

    if (Array.isArray(value)) {
      const normalized = value
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
        .filter((entry) => !isLegacyGenericSentence(entry));
      if (normalized.length) {
        out[key] = normalized;
      }
      continue;
    }

    if (typeof value === "object") {
      const nested = pruneObjectEntries(value);
      if (Object.keys(nested).length) {
        out[key] = nested;
      }
    }
  }

  return out;
}

function buildNormalizedSuggestionFromExisting(item) {
  const payload = item.suggested_update_payload && typeof item.suggested_update_payload === "object"
    ? item.suggested_update_payload
    : {};

  const existingProposed = payload.proposed_fields && typeof payload.proposed_fields === "object"
    ? payload.proposed_fields
    : {};

  const existingAspects = payload.aspect_suggestions && typeof payload.aspect_suggestions === "object"
    ? payload.aspect_suggestions
    : {};

  const proposedFields = pruneObjectEntries(existingProposed);
  const aspectSuggestions = pruneObjectEntries(existingAspects);
  const evidenceLines = Array.isArray(payload.evidence_lines)
    ? payload.evidence_lines.map((line) => String(line || "").trim()).filter(Boolean)
    : [];

  // Sem evidência concreta: remove campos textuais legados genéricos.
  if (!evidenceLines.length) {
    delete proposedFields.alert_message;
    delete proposedFields.clinical_presentation;
    delete proposedFields.treatment;
    delete proposedFields.supportive_care;
    delete aspectSuggestions.substancia;
    delete aspectSuggestions.sintomatologia;
    delete aspectSuggestions.tratamento;
  }

  const fallbackGuidelineRef = String(existingProposed.guideline_ref || "").trim();
  if (fallbackGuidelineRef) {
    proposedFields.guideline_ref = fallbackGuidelineRef;
  }

  const notesFromExisting = Array.isArray(existingProposed.notes)
    ? existingProposed.notes.map((entry) => String(entry || "").trim()).filter(Boolean).filter((entry) => !isLegacyGenericSentence(entry))
    : [];

  if (notesFromExisting.length) {
    proposedFields.notes = notesFromExisting;
  }

  if (!Object.keys(proposedFields).length) {
    return null;
  }

  const alertFromProposed = typeof proposedFields.alert_message === "string" ? proposedFields.alert_message : null;
  const clinicalFromProposed = typeof proposedFields.clinical_presentation === "string" ? proposedFields.clinical_presentation : null;

  return {
    suggestedAlertMessage: alertFromProposed,
    suggestedClinicalPresentation: clinicalFromProposed,
    suggestedUpdatePayload: {
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
      evidence_lines: evidenceLines,
    },
  };
}

function hasUsefulClinicalContent(suggestion) {
  if (!suggestion || !suggestion.suggestedUpdatePayload) return false;

  const proposed = suggestion.suggestedUpdatePayload.proposed_fields || {};
  
  // Campos clínicos úteis (excluindo referência e notas)
  const usefulClinicalFields = [
    "alert_message",
    "clinical_presentation",
    "toxic_dose_text",
    "toxic_dose_value",
    "toxic_dose_unit",
    "half_life",
    "treatment",
    "activated_charcoal",
    "lavage",
    "supportive_care",
    "antidote",
  ];

  // Verificar se algum campo clínico útil tem conteúdo
  for (const field of usefulClinicalFields) {
    const value = proposed[field];
    if (value !== null && value !== undefined && value !== "" && value !== false) {
      // Array ou objeto deve ter conteúdo real
      if (Array.isArray(value) && value.length > 0) return true;
      if (typeof value === "object" && Object.keys(value).length > 0) return true;
      if (typeof value === "string" && value.trim().length > 0) return true;
      if (typeof value === "boolean" && value === true) return true;
    }
  }

  return false;
}

async function updateQueueRow(supabase, rowId, updateScope, suggestions) {
  const { error } = await supabase
    .from("tox_radar_review_queue")
    .update({
      update_scope: updateScope,
      suggested_alert_message: suggestions.suggestedAlertMessage,
      suggested_clinical_presentation: suggestions.suggestedClinicalPresentation,
      suggested_update_payload: suggestions.suggestedUpdatePayload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId);

  if (error) {
    throw new Error(`Falha ao atualizar item ${rowId}: ${error.message}`);
  }
}

async function rejectEmptySuggestion(supabase, rowId, reason) {
  const { error } = await supabase
    .from("tox_radar_review_queue")
    .update({
      status: "rejected",
      review_notes: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId);

  if (error) {
    throw new Error(`Falha ao rejeitar item vazio ${rowId}: ${error.message}`);
  }
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

  const [queueItems, drugCatalog] = await Promise.all([
    fetchPendingQueueItems(supabase),
    fetchDrugCatalog(supabase),
  ]);

  const drugsBySlug = new Map(drugCatalog.map((drug) => [String(drug.slug), drug]));

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of queueItems) {
    scanned += 1;

    const articleUrl = String(item.article_url || "").trim();
    if (!articleUrl) {
      skipped += 1;
      continue;
    }

    const drug = drugsBySlug.get(String(item.drug_slug || "")) || {
      slug: String(item.drug_slug || ""),
      name: String(item.drug_name || "").trim() || "Substancia sem nome",
      synonyms: [String(item.drug_name || "").trim()].filter(Boolean),
    };

    try {
      const articleTitle = compactWhitespace(item.article_title || "Sem titulo");
      const source = compactWhitespace(item.source || "fonte nao informada");
      let articleText = "";

      try {
        const html = await fetchWithTimeout(articleUrl, FETCH_TIMEOUT_MS);
        const articleBody = htmlToText(html);
        articleText = compactWhitespace(`${articleTitle} ${articleBody}`);
      } catch (fetchError) {
        const fallbackText = buildFallbackArticleTextFromQueue(item);
        articleText = compactWhitespace(`${articleTitle} ${fallbackText}`);
        console.warn(`[backfill] item=${item.id} fetch bloqueado (${fetchError.message}); usando texto de fallback da fila.`);
      }

      if (!articleText) {
        skipped += 1;
        continue;
      }

      const suggestions = await buildPortugueseSuggestions(
        drug,
        { title: articleTitle, source, url: articleUrl },
        articleText
      );

      const normalizedFallback = !suggestions ? buildNormalizedSuggestionFromExisting(item) : null;
      const suggestionToApply = suggestions || normalizedFallback;

      if (!suggestionToApply) {
        skipped += 1;
        continue;
      }

      // Verificar se sugestão tem apenas referência/notas (sem conteúdo clínico útil)
      if (!hasUsefulClinicalContent(suggestionToApply)) {
        await rejectEmptySuggestion(supabase, item.id, "Sugestão contém apenas referência/notas; sem campos clínicos úteis.");
        skipped += 1;
        console.log(`[backfill] item=${item.id} rejeitado por falta de conteúdo clínico útil.`);
        continue;
      }

      await updateQueueRow(supabase, item.id, inferUpdateScope(articleText), suggestionToApply);
      updated += 1;
    } catch (error) {
      errors += 1;
      console.warn(`[backfill] item=${item.id} erro=${error.message}`);
    }
  }

  console.log(
    `[tox-radar-backfill] scanned=${scanned} updated=${updated} skipped=${skipped} errors=${errors} limit=${BACKFILL_LIMIT}`
  );
}

main().catch((error) => {
  console.error("[tox-radar-backfill] erro fatal:", error.message);
  process.exit(1);
});
