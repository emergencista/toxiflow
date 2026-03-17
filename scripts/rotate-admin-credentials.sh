#!/usr/bin/env bash
set -euo pipefail

SERVICE_FILE="/etc/systemd/system/toxiflow.service"
BACKUP_FILE="${SERVICE_FILE}.bak.$(date -u +%Y%m%d%H%M%S)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Execute como root: sudo bash scripts/rotate-admin-credentials.sh"
  exit 1
fi

if [[ ! -f "${SERVICE_FILE}" ]]; then
  echo "Arquivo de serviço não encontrado: ${SERVICE_FILE}"
  exit 1
fi

new_password="$(openssl rand -base64 36 | tr -d '\n' | tr '/+' '_-' | cut -c1-36)"
new_secret="$(openssl rand -hex 64)"

cp "${SERVICE_FILE}" "${BACKUP_FILE}"

if grep -q '^Environment="TOXIFLOW_ADMIN_PASSWORD=' "${SERVICE_FILE}"; then
  sed -i "s|^Environment=\"TOXIFLOW_ADMIN_PASSWORD=.*|Environment=\"TOXIFLOW_ADMIN_PASSWORD=${new_password}\"|" "${SERVICE_FILE}"
else
  echo "Environment=\"TOXIFLOW_ADMIN_PASSWORD=${new_password}\"" >> "${SERVICE_FILE}"
fi

if grep -q '^Environment="TOXIFLOW_ADMIN_SESSION_SECRET=' "${SERVICE_FILE}"; then
  sed -i "s|^Environment=\"TOXIFLOW_ADMIN_SESSION_SECRET=.*|Environment=\"TOXIFLOW_ADMIN_SESSION_SECRET=${new_secret}\"|" "${SERVICE_FILE}"
else
  echo "Environment=\"TOXIFLOW_ADMIN_SESSION_SECRET=${new_secret}\"" >> "${SERVICE_FILE}"
fi

systemctl daemon-reload
systemctl restart toxiflow.service

echo "Rotação concluída."
echo "Backup do unit file: ${BACKUP_FILE}"
echo "Nova senha admin: ${new_password}"
echo "Novo session secret: ${new_secret}"
