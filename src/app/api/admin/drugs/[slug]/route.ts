import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { draftToDrug, drugToSupabaseRecord, mapRowToDrug, normalizeDrugDraft } from "@/lib/drug-records";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase";
import type { SupabaseDrugRow } from "@/lib/types";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function isAuthorized(request: Request): boolean {
  const configuredToken = process.env.TOXIFLOW_ADMIN_TOKEN;

  if (!configuredToken) {
    return false;
  }

  const header = request.headers.get("authorization");
  return header === `Bearer ${configuredToken}`;
}

export async function PUT(request: Request, context: RouteContext) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Supabase admin não configurado." }, { status: 503 });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { slug } = await context.params;

  try {
    const body = await request.json();
    const draft = normalizeDrugDraft(body);
    const drug = draftToDrug(draft);
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("drugs")
      .update(drugToSupabaseRecord(drug))
      .eq("slug", slug)
      .select(
        "slug, name, category, synonyms, toxic_dose_text, toxic_dose_value, toxic_dose_unit, half_life, is_dose_unknown, alert_message, clinical_presentation, treatment, antidote, activated_charcoal, lavage, supportive_care, guideline_ref, notes"
      )
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Falha ao atualizar substância." }, { status: 400 });
    }

    revalidatePath("/");
    revalidatePath("/admin");

    return NextResponse.json({ drug: mapRowToDrug(data as SupabaseDrugRow) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha inesperada." }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Supabase admin não configurado." }, { status: 503 });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { slug } = await context.params;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("drugs").delete().eq("slug", slug);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  revalidatePath("/");
  revalidatePath("/admin");

  return NextResponse.json({ ok: true });
}