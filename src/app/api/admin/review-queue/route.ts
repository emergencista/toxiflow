import { NextResponse } from "next/server";

import { getAdminIdentityFromRequest, getRequestClientIp, isAdminAuthConfigured, isAuthorizedAdminRequest } from "@/lib/admin-auth";
import { recordAdminAudit } from "@/lib/admin-audit";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase";

const DEFAULT_LIMIT = 120;
const MAX_LIMIT = 300;

export async function GET(request: Request) {
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
      action: "review_queue_list_denied",
      actor,
      success: false,
      ip,
      userAgent,
    });
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = (url.searchParams.get("status") || "pending").trim();
  const parsedLimit = Number.parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(MAX_LIMIT, parsedLimit)) : DEFAULT_LIMIT;

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("tox_radar_review_queue")
    .select("id, created_at, updated_at, reviewed_at, applied_at, status, drug_slug, drug_name, article_url, article_title, source, update_scope, suggested_alert_message, suggested_clinical_presentation, review_notes, reviewed_by")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    await recordAdminAudit({
      action: "review_queue_list_failed",
      actor,
      success: false,
      ip,
      userAgent,
      details: { message: error.message, status, limit },
    });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await recordAdminAudit({
    action: "review_queue_list",
    actor,
    success: true,
    ip,
    userAgent,
    details: { status, limit, total: Array.isArray(data) ? data.length : 0 },
  });

  return NextResponse.json({ items: data ?? [] });
}
