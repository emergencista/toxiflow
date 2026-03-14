import "server-only";

import localDrugs from "@/data/drugs.json";
import { mapRowToDrug } from "@/lib/drug-records";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { Drug, SupabaseDrugRow } from "@/lib/types";

export async function getDrugs(): Promise<Drug[]> {
  if (!isSupabaseConfigured()) {
    return localDrugs as Drug[];
  }

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/drugs?select=slug,name,category,synonyms,toxic_dose_text,toxic_dose_value,toxic_dose_unit,half_life,is_dose_unknown,alert_message,clinical_presentation,treatment,antidote,activated_charcoal,lavage,supportive_care,guideline_ref,notes&order=name.asc`,
      {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`
        },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      console.error("Supabase read failed, falling back to local data.", response.status, response.statusText);
      return localDrugs as Drug[];
    }

    const data = (await response.json()) as SupabaseDrugRow[];

    if (!data.length) {
      console.error("Supabase read returned no rows, falling back to local data.");
      return localDrugs as Drug[];
    }

    return data.map(mapRowToDrug);
  } catch (error) {
    console.error("Unexpected Supabase error, falling back to local data.", error);
    return localDrugs as Drug[];
  }
}