import { createSupabaseAdminClient } from "./supabase";
import { writeSecurityEvent } from "./security-log";

type AdminAuditEntry = {
  action: string;
  actor: string;
  success: boolean;
  ip: string;
  target?: string;
  details?: Record<string, unknown>;
  userAgent?: string;
};

export async function recordAdminAudit(entry: AdminAuditEntry): Promise<void> {
  await writeSecurityEvent({
    type: `admin:${entry.action}`,
    actor: entry.actor,
    success: entry.success,
    ip: entry.ip,
    details: {
      target: entry.target,
      userAgent: entry.userAgent,
      ...entry.details,
    },
  });

  try {
    const supabase = createSupabaseAdminClient();
    await supabase.from("admin_audit_logs").insert({
      action: entry.action,
      actor: entry.actor,
      success: entry.success,
      ip: entry.ip,
      target: entry.target ?? null,
      details: entry.details ?? {},
      user_agent: entry.userAgent ?? null,
    });
  } catch {
    // Keep DB audit best-effort to avoid operational impact if table/env is unavailable.
  }
}
