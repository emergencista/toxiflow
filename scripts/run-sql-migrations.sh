#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Erro: DATABASE_URL nao definido."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Erro: psql nao encontrado no ambiente."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS=(
  "supabase/tox_alerts_sent.sql"
  "supabase/tox_radar_review_queue.sql"
  "supabase/admin_audit_logs.sql"
)

echo "Aplicando migrations SQL no banco..."
for migration in "${MIGRATIONS[@]}"; do
  migration_path="${ROOT_DIR}/${migration}"
  if [[ ! -f "${migration_path}" ]]; then
    echo "Aviso: migration ausente, pulando: ${migration}"
    continue
  fi

  echo "- Executando ${migration}"
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${migration_path}" >/dev/null
  echo "  OK"
done

echo "Migrations finalizadas com sucesso."
