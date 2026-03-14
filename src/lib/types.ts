export type CharcoalRecommendation = "recommended" | "conditional" | "contraindicated";
export type LavageRecommendation = "consider" | "not-routine" | "contraindicated";

export interface Antidote {
  name: string;
  indication: string | null;
  dose: string | null;
}

export interface Drug {
  slug: string;
  name: string;
  category: string;
  synonyms: string[];
  toxicDose: string | null;
  toxicDoseValue: number | null;
  toxicDoseUnit: string | null;
  halfLife: string | null;
  isDoseUnknown: boolean;
  alertMessage: string | null;
  clinicalPresentation: string | null;
  treatment: string[];
  antidote: Antidote | null;
  activatedCharcoal: CharcoalRecommendation;
  lavage: LavageRecommendation;
  supportiveCare: string | null;
  guidelineRef: string | null;
  notes: string[];
}

export interface SupabaseDrugRow {
  slug: string;
  name: string;
  category: string;
  synonyms: string[] | null;
  toxic_dose_text: string | null;
  toxic_dose_value: number | null;
  toxic_dose_unit: string | null;
  half_life: string | null;
  is_dose_unknown: boolean | null;
  alert_message: string | null;
  clinical_presentation: string | null;
  treatment: string[] | null;
  antidote: Antidote | null;
  activated_charcoal: CharcoalRecommendation;
  lavage: LavageRecommendation;
  supportive_care: string | null;
  guideline_ref: string | null;
  notes: string[] | null;
}

export interface DrugDraft {
  name: string;
  category: string;
  synonyms: string[];
  toxicDose: string | null;
  toxicDoseValue: number | null;
  toxicDoseUnit: string | null;
  halfLife: string | null;
  isDoseUnknown: boolean;
  alertMessage: string | null;
  clinicalPresentation: string | null;
  treatment: string[];
  antidote: Antidote | null;
  activatedCharcoal: CharcoalRecommendation;
  lavage: LavageRecommendation;
  supportiveCare: string | null;
  guidelineRef: string | null;
  notes: string[];
}