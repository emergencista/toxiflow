import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getAdminIdentityFromRequest, getRequestClientIp, isAdminAuthConfigured, isAuthorizedAdminRequest } from "@/lib/admin-auth";
import { recordAdminAudit } from "@/lib/admin-audit";
import { draftToDrug, drugToSupabaseRecord, mapRowToDrug, normalizeDrugDraft } from "@/lib/drug-records";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase";
import type { SupabaseDrugRow } from "@/lib/types";

export async function POST(request: Request) {
  const actor = getAdminIdentityFromRequest(request);
  const ip = getRequestClientIp(request);
  const userAgent = request.headers.get("user-agent") || "unknown";

  if (!isAdminAuthConfigured()) {
    return NextResponse.json({ error: "Admin não configurado." }, { status: 503 });
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Supabase admin não configurado." }, { status: 503 });
  }

  if (!isAuthorizedAdminRequest(request)) {
    await recordAdminAudit({
      action: "drug_create_denied",
      actor,
      success: false,
      ip,
      userAgent,
    });
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const draft = normalizeDrugDraft(body);
    const drug = draftToDrug(draft);
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("drugs")
      .insert(drugToSupabaseRecord(drug))
      .select(
        "slug, name, category, synonyms, toxic_dose_text, toxic_dose_value, toxic_dose_unit, half_life, is_dose_unknown, alert_message, clinical_presentation, treatment, antidote, activated_charcoal, lavage, supportive_care, guideline_ref, notes"
      )
      .single();

    if (error || !data) {
      await recordAdminAudit({
        action: "drug_create_failed",
        actor,
        success: false,
        ip,
        userAgent,
        details: { message: error?.message ?? "unknown" },
      });
      return NextResponse.json({ error: error?.message ?? "Falha ao inserir substância." }, { status: 400 });
    }

    revalidatePath("/");
    revalidatePath("/admin");

    await recordAdminAudit({
      action: "drug_create",
      actor,
      success: true,
      ip,
      target: drug.slug,
      userAgent,
    });

    return NextResponse.json({ drug: mapRowToDrug(data as SupabaseDrugRow) });
  } catch (error) {
    await recordAdminAudit({
      action: "drug_create_failed",
      actor,
      success: false,
      ip,
      userAgent,
      details: { message: error instanceof Error ? error.message : "unexpected" },
    });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha inesperada." }, { status: 400 });
  }
}