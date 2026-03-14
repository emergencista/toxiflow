import "server-only";

import localDrugs from "@/data/drugs.json";
import { mapRowToDrug } from "@/lib/drug-records";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase";
import type { Drug, SupabaseDrugRow } from "@/lib/types";

export async function getDrugs(): Promise<Drug[]> {
  if (!isSupabaseConfigured()) {
    return localDrugs as Drug[];
  }

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("drugs")
      .select(
        "slug, name, category, synonyms, toxic_dose_text, toxic_dose_value, toxic_dose_unit, half_life, is_dose_unknown, alert_message, clinical_presentation, treatment, antidote, activated_charcoal, lavage, supportive_care, guideline_ref, notes"
      )
      .order("name", { ascending: true });

    if (error || !data?.length) {
      console.error("Supabase read failed, falling back to local data.", error);
      return localDrugs as Drug[];
    }

    return (data as SupabaseDrugRow[]).map(mapRowToDrug);
  } catch (error) {
    console.error("Unexpected Supabase error, falling back to local data.", error);
    return localDrugs as Drug[];
  }
}