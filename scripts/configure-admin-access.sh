#!/bin/bash
# Configure TOXIFLOW admin access - obtém IP público e adiciona à allowlist

set -e

SERVICE_NAME="toxiflow.service"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}"

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Configurador de Acesso Admin ToxiFlow ===${NC}"

# Detecta IP público
echo "Detectando IP público..."
PUBLIC_IP=$(curl -s https://ifconfig.me 2>/dev/null || echo "")

if [ -z "$PUBLIC_IP" ]; then
  echo -e "${RED}Erro: Não foi possível detectar IP público${NC}"
  echo "Tente fornecer o IP manualmente: $0 <seu-ip>"
  exit 1
fi

echo -e "${GREEN}IP detectado: ${PUBLIC_IP}${NC}"

# Se o usuário passou um IP como argumento, usa ele
if [ ! -z "$1" ]; then
  PUBLIC_IP="$1"
  echo -e "${GREEN}IP sobrescrito pelo argumento: ${PUBLIC_IP}${NC}"
fi

# Verifica se é root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Erro: Este script precisa ser executado como root${NC}"
  echo "Execute: sudo $0"
  exit 1
fi

# Verifica se o arquivo do serviço existe
if [ ! -f "$SERVICE_FILE" ]; then
  echo -e "${RED}Erro: Arquivo de serviço não encontrado: ${SERVICE_FILE}${NC}"
  exit 1
fi

echo "Atualizando ${SERVICE_FILE}..."

# Adiciona ou atualiza TOXIFLOW_ADMIN_IP_ALLOWLIST
if grep -q "^Environment=\"TOXIFLOW_ADMIN_IP_ALLOWLIST" "$SERVICE_FILE"; then
  echo "  Atualizando TOXIFLOW_ADMIN_IP_ALLOWLIST..."
  sed -i "s|^Environment=\"TOXIFLOW_ADMIN_IP_ALLOWLIST=.*|Environment=\"TOXIFLOW_ADMIN_IP_ALLOWLIST=${PUBLIC_IP}\"|" "$SERVICE_FILE"
else
  echo "  Adicionando TOXIFLOW_ADMIN_IP_ALLOWLIST..."
  # Encontra a última linha Environment e adiciona depois dela
  sed -i "/^Environment=\"/a Environment=\"TOXIFLOW_ADMIN_IP_ALLOWLIST=${PUBLIC_IP}\"" "$SERVICE_FILE"
fi

echo -e "${GREEN}✓ Arquivo de serviço atualizado${NC}"

# Recarrega systemd daemon
echo "Recarregando systemd daemon..."
systemctl daemon-reload

# Reinicia o serviço
echo "Reiniciando ${SERVICE_NAME}..."
systemctl restart "$SERVICE_NAME"

# Verifica se o serviço ficou running
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo -e "${GREEN}✓ Serviço reiniciado com sucesso${NC}"
else
  echo -e "${RED}✗ Erro ao reiniciar o serviço${NC}"
  systemctl status "$SERVICE_NAME" || true
  exit 1
fi

echo ""
echo -e "${GREEN}=== Configuração Concluída ===${NC}"
echo "IP autorizado: ${PUBLIC_IP}"
echo ""
echo "Você agora pode acessar: https://emergencista.tech/toxiflow/admin"
echo ""
