import type { Antidote, Drug, DrugDraft, SupabaseDrugRow } from "@/lib/types";
import { slugify } from "@/lib/drug-utils";

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/) 
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeAntidote(value: unknown): Antidote | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const antidote = value as Record<string, unknown>;
  const name = cleanString(antidote.name);

  if (!name) {
    return null;
  }

  return {
    name,
    indication: cleanString(antidote.indication),
    dose: cleanString(antidote.dose)
  };
}

export function mapRowToDrug(row: SupabaseDrugRow): Drug {
  return {
    slug: row.slug,
    name: row.name,
    category: row.category,
    synonyms: row.synonyms ?? [],
    toxicDose: row.toxic_dose_text,
    toxicDoseValue: row.toxic_dose_value,
    toxicDoseUnit: row.toxic_dose_unit,
    halfLife: row.half_life,
    isDoseUnknown: Boolean(row.is_dose_unknown),
    alertMessage: row.alert_message,
    clinicalPresentation: row.clinical_presentation,
    treatment: row.treatment ?? [],
    antidote: row.antidote,
    activatedCharcoal: row.activated_charcoal,
    lavage: row.lavage,
    supportiveCare: row.supportive_care,
    guidelineRef: row.guideline_ref,
    notes: row.notes ?? []
  };
}

export function normalizeDrugDraft(input: unknown): DrugDraft {
  if (!input || typeof input !== "object") {
    throw new Error("Payload inválido.");
  }

  const data = input as Record<string, unknown>;
  const name = cleanString(data.name);
  const category = cleanString(data.category);
  const isDoseUnknown = Boolean(data.isDoseUnknown);

  if (!name) {
    throw new Error("Nome é obrigatório.");
  }

  if (!category) {
    throw new Error("Categoria é obrigatória.");
  }

  const toxicDoseValue = data.toxicDoseValue == null || data.toxicDoseValue === "" ? null : Number(data.toxicDoseValue);

  if (!isDoseUnknown && toxicDoseValue != null && Number.isNaN(toxicDoseValue)) {
    throw new Error("Dose tóxica numérica inválida.");
  }

  const draft: DrugDraft = {
    name,
    category,
    synonyms: normalizeList(data.synonyms).length ? normalizeList(data.synonyms) : [name],
    toxicDose: isDoseUnknown ? null : cleanString(data.toxicDose),
    toxicDoseValue: isDoseUnknown ? null : toxicDoseValue,
    toxicDoseUnit: isDoseUnknown ? null : cleanString(data.toxicDoseUnit),
    halfLife: cleanString(data.halfLife),
    isDoseUnknown,
    alertMessage: isDoseUnknown ? cleanString(data.alertMessage) : cleanString(data.alertMessage),
    clinicalPresentation: cleanString(data.clinicalPresentation),
    treatment: normalizeList(data.treatment),
    antidote: normalizeAntidote(data.antidote),
    activatedCharcoal:
      data.activatedCharcoal === "recommended" || data.activatedCharcoal === "contraindicated"
        ? data.activatedCharcoal
        : "conditional",
    lavage:
      data.lavage === "consider" || data.lavage === "contraindicated"
        ? data.lavage
        : "not-routine",
    supportiveCare: cleanString(data.supportiveCare),
    guidelineRef: cleanString(data.guidelineRef),
    notes: normalizeList(data.notes)
  };

  if (!draft.isDoseUnknown && !draft.toxicDose && draft.toxicDoseValue != null && draft.toxicDoseUnit) {
    draft.toxicDose = `> ${draft.toxicDoseValue} ${draft.toxicDoseUnit}/kg`;
  }

  if (!draft.isDoseUnknown && draft.toxicDoseValue == null) {
    throw new Error("Dose tóxica numérica é obrigatória para substâncias calculáveis.");
  }

  if (!draft.isDoseUnknown && !draft.toxicDoseUnit) {
    throw new Error("Unidade da dose tóxica é obrigatória para substâncias calculáveis.");
  }

  if (draft.isDoseUnknown && !draft.alertMessage) {
    throw new Error("Mensagem de alerta é obrigatória para substâncias sem dose conhecida.");
  }

  if (!draft.treatment.length) {
    throw new Error("Informe ao menos uma orientação terapêutica.");
  }

  return draft;
}

export function draftToDrug(draft: DrugDraft): Drug {
  return {
    slug: slugify(draft.name),
    ...draft
  };
}

export function drugToSupabaseRecord(drug: Drug) {
  return {
    slug: drug.slug,
    name: drug.name,
    category: drug.category,
    synonyms: drug.synonyms,
    toxic_dose_text: drug.toxicDose,
    toxic_dose_value: drug.toxicDoseValue,
    toxic_dose_unit: drug.toxicDoseUnit,
    half_life: drug.halfLife,
    is_dose_unknown: drug.isDoseUnknown,
    alert_message: drug.alertMessage,
    clinical_presentation: drug.clinicalPresentation,
    treatment: drug.treatment,
    antidote: drug.antidote,
    activated_charcoal: drug.activatedCharcoal,
    lavage: drug.lavage,
    supportive_care: drug.supportiveCare,
    guideline_ref: drug.guidelineRef,
    notes: drug.notes
  };
}