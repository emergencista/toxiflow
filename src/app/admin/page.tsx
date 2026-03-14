import { AdminPanel } from "@/components/admin/AdminPanel";
import { getDrugs } from "@/lib/drugs";
import { isSupabaseAdminConfigured } from "@/lib/supabase";

export default async function AdminPage() {
  const drugs = await getDrugs();

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <AdminPanel initialDrugs={drugs} isConfigured={isSupabaseAdminConfigured()} />
    </main>
  );
}