import type { CharcoalRecommendation, Drug, LavageRecommendation } from "@/lib/types";

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function convertToMg(value: number, unit: string): number {
  if (unit === "g") {
    return value * 1000;
  }

  if (unit === "mcg") {
    return value / 1000;
  }

  return value;
}

export function toxicDosePerKgInMg(drug: Drug): number | null {
  if (drug.isDoseUnknown || drug.toxicDoseValue == null || !drug.toxicDoseUnit) {
    return null;
  }

  return convertToMg(drug.toxicDoseValue, drug.toxicDoseUnit);
}

export function calculateThresholdMg(drug: Drug, weight: number): number | null {
  if (drug.isDoseUnknown) {
    return null;
  }

  const perKg = toxicDosePerKgInMg(drug);
  if (perKg == null || !weight) {
    return null;
  }

  return perKg * weight;
}

export function slugify(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getCharcoalCopy(
  recommendation: CharcoalRecommendation,
  elapsedHours: number | null
): string {
  if (recommendation === "contraindicated") {
    return "Carvão ativado contraindicado para esta substância.";
  }

  if (elapsedHours == null) {
    return recommendation === "recommended"
      ? "Carvão ativado recomendado quando administrado precocemente."
      : "Carvão ativado depende do tempo, risco clínico e proteção de via aérea.";
  }

  if (elapsedHours <= 1) {
    return recommendation === "recommended"
      ? "Carvão ativado recomendado na primeira hora, se a via aérea estiver protegida."
      : "Considerar carvão ativado na primeira hora, conforme risco toxicológico e contraindicações.";
  }

  if (elapsedHours <= 2) {
    return recommendation === "recommended"
      ? "Ainda pode haver benefício com carvão ativado até 2 horas em ingestões relevantes."
      : "Benefício do carvão ativado passa a ser mais seletivo após 1 hora.";
  }

  return "Fora da janela habitual para carvão ativado, salvo cenários selecionados de liberação prolongada ou grandes ingestões.";
}

export function getLavageCopy(recommendation: LavageRecommendation): string {
  if (recommendation === "consider") {
    return "Lavagem gástrica não é rotineira, mas pode ser considerada em ingestão potencialmente letal e apresentação muito precoce.";
  }

  if (recommendation === "contraindicated") {
    return "Lavagem gástrica contraindicada para este cenário.";
  }

  return "Lavagem gástrica não recomendada de rotina.";
}

export function isMatch(drug: Drug, query: string): boolean {
  const term = normalizeText(query);

  if (!term) {
    return true;
  }

  return [drug.name, ...drug.synonyms].some((entry) => normalizeText(entry).includes(term));
}