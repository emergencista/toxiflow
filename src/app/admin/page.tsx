import { cookies, headers } from "next/headers";

import { AdminPanel } from "@/components/admin/AdminPanel";
import { AdminLogin } from "@/components/admin/AdminLogin";
import {
  ADMIN_SESSION_COOKIE_NAME,
  isAdminAuthConfigured,
  isAdminIpAllowedByValue,
  isAdminSessionValue,
} from "@/lib/admin-auth";
import { getDrugs } from "@/lib/drugs";
import { isSupabaseAdminConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!isAdminAuthConfigured()) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <section className="mx-auto mt-8 w-full max-w-2xl rounded-[2rem] border border-amber-300 bg-amber-50 p-6 text-amber-950 shadow-[0_22px_70px_-36px_rgba(15,23,42,0.45)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em]">Admin indisponível</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Configure as credenciais seguras no servidor</h1>
          <p className="mt-3 text-sm leading-6">
            Defina TOXIFLOW_ADMIN_USERNAME, TOXIFLOW_ADMIN_PASSWORD e TOXIFLOW_ADMIN_SESSION_SECRET antes de publicar o painel administrativo.
          </p>
        </section>
      </main>
    );
  }

  const headerStore = await headers();
  const clientIp = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || headerStore.get("x-real-ip") || "unknown";

  if (!isAdminIpAllowedByValue(clientIp)) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <section className="mx-auto mt-8 w-full max-w-2xl rounded-[2rem] border border-rose-300 bg-rose-50 p-6 text-rose-950 shadow-[0_22px_70px_-36px_rgba(15,23,42,0.45)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em]">Acesso bloqueado</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Este IP não está autorizado para /admin</h1>
          <p className="mt-3 text-sm leading-6">Adicione o IP na variável TOXIFLOW_ADMIN_IP_ALLOWLIST para liberar o acesso administrativo.</p>
        </section>
      </main>
    );
  }

  const cookieStore = await cookies();
  const isAuthenticated = isAdminSessionValue(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);

  if (!isAuthenticated) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <AdminLogin />
      </main>
    );
  }

  const drugs = await getDrugs();

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <AdminPanel initialDrugs={drugs} isConfigured={isSupabaseAdminConfigured()} />
    </main>
  );
}