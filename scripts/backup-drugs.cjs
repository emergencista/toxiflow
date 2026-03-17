#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_DIR = process.env.TOXIFLOW_BACKUP_DIR || "/var/backups/toxiflow";
const RETENTION_DAYS = Number.parseInt(process.env.TOXIFLOW_BACKUP_RETENTION_DAYS || "14", 10);

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para backup.");
  }
}

function timestampLabel() {
  const now = new Date();
  const pad = (v) => String(v).padStart(2, "0");
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

async function fetchTable(tableName, options = {}) {
  const allowMissing = options.allowMissing === true;
  const endpoint = `${SUPABASE_URL}/rest/v1/${tableName}?select=*`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (allowMissing && response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`Falha ao consultar ${tableName}: HTTP ${response.status}`);
  }

  return response.json();
}

async function pruneOldBackups() {
  if (!Number.isFinite(RETENTION_DAYS) || RETENTION_DAYS <= 0) {
    return;
  }

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const filePath = path.join(BACKUP_DIR, entry.name);
    const stats = await fs.stat(filePath);
    if (stats.mtimeMs < cutoff) {
      await fs.unlink(filePath);
    }
  }
}

async function run() {
  assertEnv();

  await fs.mkdir(BACKUP_DIR, { recursive: true });

  const [drugs, adminAuditLogs] = await Promise.all([
    fetchTable("drugs"),
    fetchTable("admin_audit_logs", { allowMissing: true }),
  ]);

  const payload = {
    generated_at: new Date().toISOString(),
    source: "toxiflow/supabase",
    tables: {
      drugs,
      admin_audit_logs: adminAuditLogs,
    },
  };

  const backupFile = path.join(BACKUP_DIR, `toxiflow-backup-${timestampLabel()}.json`);
  await fs.writeFile(backupFile, JSON.stringify(payload), "utf8");
  await pruneOldBackups();

  console.log(`Backup finalizado: ${backupFile}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha no backup.");
  process.exit(1);
});
