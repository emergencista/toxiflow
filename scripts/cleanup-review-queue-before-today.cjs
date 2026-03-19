#!/usr/bin/env node
require("dotenv").config();
require("dotenv").config({ path: ".env.local", override: false });

const { createClient } = require("@supabase/supabase-js");

function getEnv(name, fallback = "") {
  const value = process.env[name];
  if (value && String(value).trim()) return String(value).trim();
  return fallback;
}

async function main() {
  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date();
  const todayUtc = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

  const { data: oldRows, error: selectError } = await supabase
    .from("tox_radar_review_queue")
    .select("id,created_at,drug_name,status")
    .lt("created_at", `${todayUtc}T00:00:00.000Z`)
    .order("created_at", { ascending: true });

  if (selectError) {
    throw new Error(`Falha ao listar registros antigos: ${selectError.message}`);
  }

  const rows = Array.isArray(oldRows) ? oldRows : [];
  if (!rows.length) {
    console.log(`[cleanup-review-queue] nenhum registro anterior a ${todayUtc} encontrado.`);
    return;
  }

  const ids = rows.map((row) => row.id);
  const { error: deleteError } = await supabase
    .from("tox_radar_review_queue")
    .delete()
    .in("id", ids);

  if (deleteError) {
    throw new Error(`Falha ao deletar registros antigos: ${deleteError.message}`);
  }

  console.log(`[cleanup-review-queue] deletados=${rows.length} cutoff_utc=${todayUtc}T00:00:00.000Z`);
}

main().catch((error) => {
  console.error("[cleanup-review-queue] erro fatal:", error.message);
  process.exit(1);
});
