#!/usr/bin/env bash
set -euo pipefail

SERVICE_FILE="/etc/systemd/system/toxiflow.service"
APP_URL_LOCAL="http://127.0.0.1:3002/toxiflow/admin"
BLOCK_MARKER="Acesso bloqueado"

if [[ ! -f "${SERVICE_FILE}" ]]; then
  echo "Erro: service file nao encontrado: ${SERVICE_FILE}" >&2
  exit 1
fi

CURRENT_LINE="$(grep '^Environment=TOXIFLOW_ADMIN_IP_ALLOWLIST=' "${SERVICE_FILE}" || true)"
CURRENT_VALUE="${CURRENT_LINE#Environment=TOXIFLOW_ADMIN_IP_ALLOWLIST=}"

IPV4="$(curl -4 -s https://ifconfig.me || true)"
IPV6="$(curl -6 -s https://ifconfig.me || true)"

# IP informado pelo usuario durante suporte.
USER_IP="177.135.203.103"

# Argumentos opcionais: IPs extras separados por espaco.
EXTRA_IPS="${*:-}"

combined="${CURRENT_VALUE},${USER_IP},${IPV4},${IPV6},${EXTRA_IPS}"

NEW_VALUE="$(echo "${combined}" | tr ', ' '\n' | sed '/^$/d' | awk '!seen[$0]++' | paste -sd, -)"

if [[ -z "${NEW_VALUE}" ]]; then
  echo "Erro: lista de IPs ficou vazia, abortando por seguranca." >&2
  exit 1
fi

echo "Allowlist candidata: ${NEW_VALUE}"

sudo sed -i "s|^Environment=TOXIFLOW_ADMIN_IP_ALLOWLIST=.*|Environment=TOXIFLOW_ADMIN_IP_ALLOWLIST=${NEW_VALUE}|" "${SERVICE_FILE}"

sudo systemctl daemon-reload
sudo systemctl restart toxiflow
sleep 1

# Valida para cada IP permitido se pagina admin nao cai em bloqueio.
IFS=',' read -r -a IPS <<< "${NEW_VALUE}"
for ip in "${IPS[@]}"; do
  [[ -z "${ip}" ]] && continue
  body="$(curl -s -H "x-forwarded-for: ${ip}" "${APP_URL_LOCAL}" || true)"
  if echo "${body}" | grep -q "${BLOCK_MARKER}"; then
    echo "Falha de validacao para IP ${ip}; iniciando rollback..." >&2
    sudo sed -i "s|^Environment=TOXIFLOW_ADMIN_IP_ALLOWLIST=.*|Environment=TOXIFLOW_ADMIN_IP_ALLOWLIST=${CURRENT_VALUE}|" "${SERVICE_FILE}"
    sudo systemctl daemon-reload
    sudo systemctl restart toxiflow
    echo "Rollback concluido. Allowlist restaurada para valor anterior." >&2
    exit 1
  fi
  echo "Validacao OK para ${ip}"
done

echo "Allowlist aplicada com seguranca."
sudo systemctl show toxiflow -p Environment --no-pager
