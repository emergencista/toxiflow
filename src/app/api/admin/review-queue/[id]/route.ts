import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getAdminIdentityFromRequest, getRequestClientIp, isAdminAuthConfigured, isAuthorizedAdminRequest } from "@/lib/admin-auth";
import { recordAdminAudit } from "@/lib/admin-audit";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ReviewAction = "approve" | "reject" | "apply";

type SuggestedUpdatePayload = {
  proposed_fields?: Record<string, unknown>;
};

function buildDrugUpdatePayload(
  suggestedAlert: string,
  suggestedClinical: string,
  suggestedPayload: SuggestedUpdatePayload | null
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (suggestedAlert) {
    payload.alert_message = suggestedAlert;
  }

  if (suggestedClinical) {
    payload.clinical_presentation = suggestedClinical;
  }

  const allowedKeys = new Set([
    "alert_message",
    "clinical_presentation",
    "treatment",
    "supportive_care",
    "guideline_ref",
    "notes",
  ]);

  const proposed = suggestedPayload?.proposed_fields;
  if (proposed && typeof proposed === "object") {
    for (const [key, value] of Object.entries(proposed)) {
      if (!allowedKeys.has(key)) {
        continue;
      }

      if (value == null) {
        continue;
      }

      if ((key === "treatment" || key === "notes") && Array.isArray(value)) {
        const normalized = value
          .map((entry) => String(entry || "").trim())
          .filter(Boolean);
        if (normalized.length) {
          payload[key] = normalized;
        }
        continue;
      }

      if (typeof value === "string") {
        const normalized = value.trim();
        if (normalized) {
          payload[key] = normalized;
        }
      }
    }
  }

  return payload;
}

function isReviewAction(value: string): value is ReviewAction {
  return value === "approve" || value === "reject" || value === "apply";
}

function isMissingSuggestedPayloadColumn(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("suggested_update_payload") && normalized.includes("does not exist");
}

export async function PATCH(request: Request, context: RouteContext) {
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
      action: "review_queue_action_denied",
      actor,
      success: false,
      ip,
      userAgent,
    });
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { id } = await context.params;

  let body: { action?: string; reviewNotes?: string } = {};
  try {
    body = (await request.json()) as { action?: string; reviewNotes?: string };
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const action = String(body.action || "").trim();
  const reviewNotes = String(body.reviewNotes || "").trim();

  if (!isReviewAction(action)) {
    return NextResponse.json({ error: "Ação inválida. Use approve, reject ou apply." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  let { data: queueItem, error: queueError } = await supabase
    .from("tox_radar_review_queue")
    .select("id,status,drug_slug,drug_name,suggested_alert_message,suggested_clinical_presentation,suggested_update_payload")
    .eq("id", id)
    .single();

  if (queueError && isMissingSuggestedPayloadColumn(queueError.message)) {
    const fallback = await supabase
      .from("tox_radar_review_queue")
      .select("id,status,drug_slug,drug_name,suggested_alert_message,suggested_clinical_presentation")
      .eq("id", id)
      .single();

    queueItem = fallback.data ? { ...fallback.data, suggested_update_payload: null } : null;
    queueError = fallback.error;
  }

  if (queueError || !queueItem) {
    await recordAdminAudit({
      action: "review_queue_action_failed",
      actor,
      success: false,
      ip,
      userAgent,
      target: id,
      details: { message: queueError?.message || "item_not_found", action },
    });
    return NextResponse.json({ error: queueError?.message || "Item não encontrado." }, { status: 404 });
  }

  if (action === "approve") {
    const { error } = await supabase
      .from("tox_radar_review_queue")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: actor,
        review_notes: reviewNotes || null,
      })
      .eq("id", id);

    if (error) {
      await recordAdminAudit({
        action: "review_queue_approve_failed",
        actor,
        success: false,
        ip,
        userAgent,
        target: String(id),
        details: { message: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await recordAdminAudit({
      action: "review_queue_approve",
      actor,
      success: true,
      ip,
      userAgent,
      target: String(id),
      details: { drugSlug: queueItem.drug_slug },
    });

    return NextResponse.json({ ok: true, status: "approved" });
  }

  if (action === "reject") {
    const { error } = await supabase
      .from("tox_radar_review_queue")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: actor,
        review_notes: reviewNotes || null,
      })
      .eq("id", id);

    if (error) {
      await recordAdminAudit({
        action: "review_queue_reject_failed",
        actor,
        success: false,
        ip,
        userAgent,
        target: String(id),
        details: { message: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await recordAdminAudit({
      action: "review_queue_reject",
      actor,
      success: true,
      ip,
      userAgent,
      target: String(id),
      details: { drugSlug: queueItem.drug_slug },
    });

    return NextResponse.json({ ok: true, status: "rejected" });
  }

  const suggestedAlert = String(queueItem.suggested_alert_message || "").trim();
  const suggestedClinical = String(queueItem.suggested_clinical_presentation || "").trim();
  const suggestedPayload = (queueItem.suggested_update_payload || null) as SuggestedUpdatePayload | null;
  const drugUpdatePayload = buildDrugUpdatePayload(suggestedAlert, suggestedClinical, suggestedPayload);

  if (!Object.keys(drugUpdatePayload).length) {
    return NextResponse.json({ error: "Não há sugestão aplicável para este item." }, { status: 400 });
  }

  const { error: drugError } = await supabase.from("drugs").update(drugUpdatePayload).eq("slug", queueItem.drug_slug);
  if (drugError) {
    await recordAdminAudit({
      action: "review_queue_apply_failed",
      actor,
      success: false,
      ip,
      userAgent,
      target: String(id),
      details: { message: drugError.message, drugSlug: queueItem.drug_slug },
    });
    return NextResponse.json({ error: drugError.message }, { status: 400 });
  }

  const { error: queueUpdateError } = await supabase
    .from("tox_radar_review_queue")
    .update({
      status: "applied",
      reviewed_at: new Date().toISOString(),
      applied_at: new Date().toISOString(),
      reviewed_by: actor,
      review_notes: reviewNotes || null,
    })
    .eq("id", id);

  if (queueUpdateError) {
    await recordAdminAudit({
      action: "review_queue_apply_failed",
      actor,
      success: false,
      ip,
      userAgent,
      target: String(id),
      details: { message: queueUpdateError.message, drugSlug: queueItem.drug_slug },
    });
    return NextResponse.json({ error: queueUpdateError.message }, { status: 400 });
  }

  revalidatePath("/");
  revalidatePath("/admin");

  await recordAdminAudit({
    action: "review_queue_apply",
    actor,
    success: true,
    ip,
    userAgent,
    target: String(id),
    details: {
      drugSlug: queueItem.drug_slug,
      fields: Object.keys(drugUpdatePayload),
    },
  });

  return NextResponse.json({ ok: true, status: "applied", fields: Object.keys(drugUpdatePayload) });
}
