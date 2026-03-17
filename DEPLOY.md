# Configuração de Deploy Automático - ToxiFlow Admin

## Status Atual ✅

Seu IP foi automaticamente autorizado e o serviço foi reiniciado:

```
IP autorizado: 2a02:4780:6e:d69c::1
Serviço: toxiflow.service (ativo e rodando)
```

Você pode agora acessar: **https://emergencista.tech/toxiflow/admin**

---

## Para Deploy Automático com GitHub Actions

Se você quer que o GitHub Actions automaticamente reconfigure o IP quando houver novo push, configure estes secrets no GitHub:

### 1. Acesse: `Settings → Secrets and variables → Actions`

Adicione os seguintes secrets:

| Secret | Descrição | Exemplo |
|--------|-----------|---------|
| `DEPLOY_SSH_KEY` | Chave SSH privada para acesso ao servidor | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `DEPLOY_HOST` | Hostname/IP do servidor | `emergencista.tech` ou `203.0.113.42` |
| `ADMIN_IP_ALLOWLIST` | IP(s) autorizado(s) para /admin | `2a02:4780:6e:d69c::1` ou `203.0.113.42,192.168.1.1` |

### 2. Credenciais do Admin

Além disso, adicione os secrets das credenciais:

| Secret | Descrição |
|--------|-----------|
| `TOXIFLOW_ADMIN_USERNAME` | Nome de usuário para login `/admin` |
| `TOXIFLOW_ADMIN_PASSWORD` | Senha segura (min 16 caracteres) |
| `TOXIFLOW_ADMIN_SESSION_SECRET` | Token de sessão (min 32 caracteres) |

### 3. Configurar SSH Key

Para gerar a SSH key:

```bash
ssh-keygen -t ed25519 -C "github-actions@toxiflow" -f /tmp/gh-deploy
cat /tmp/gh-deploy  # Copie TODA a chave privada (com headers) para DEPLOY_SSH_KEY secret
```

Adicione a chave pública ao servidor:

```bash
cat /tmp/gh-deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Confirme o acesso:

```bash
ssh -i /tmp/gh-deploy ubuntu@emergencista.tech "echo 'SSH funciona'"
```

---

## Scripts Locais

### Configurar Acesso Admin (Imediato)

```bash
sudo /home/ubuntu/toxiflow/scripts/configure-admin-access.sh [IP_OPCIONAL]
```

Exemplos:
```bash
# Usa IP público detectado automaticamente
sudo ./scripts/configure-admin-access.sh

# Usa um IP específico (útil para múltiplos IPs)
sudo ./scripts/configure-admin-access.sh "2a02:4780:6e:d69c::1,203.0.113.42"
```

### Verificar Configuração

```bash
systemctl cat toxiflow | grep TOXIFLOW_ADMIN

# Deve mostrar:
# Environment="TOXIFLOW_ADMIN_IP_ALLOWLIST=2a02:4780:6e:d69c::1"
```

### Testar Acesso

```bash
curl -I https://emergencista.tech/toxiflow/admin

# Esperado: 200 OK (se não autenticado) ou 302 (redirect para login)
# Não esperado: 403 Forbidden
```

---

## Credenciais de Login

Para acessar o painel admin, use as credenciais configuradas em:

```bash
# Verifique o username configurado
sudo systemctl cat toxiflow | grep TOXIFLOW_ADMIN_USERNAME

# A senha está armazenada de forma segura no systemd
```

Se não tem credenciais ainda, gere novas:

```bash
# Gere uma senha segura
openssl rand -base64 32

# Gere um secret de sessão
openssl rand -hex 32

# Configure manualmente ou use o script de rotação
sudo /home/ubuntu/toxiflow/scripts/rotate-admin-credentials.sh
```

---

## Troubleshooting

### Ainda vejo 403 Forbidden?

1. **Verifique o IP autorizado:**
   ```bash
   systemctl cat toxiflow | grep TOXIFLOW_ADMIN_IP_ALLOWLIST
   ```

2. **Reinicie o serviço:**
   ```bash
   sudo systemctl restart toxiflow
   ```

3. **Verifique se o serviço está rodando:**
   ```bash
   sudo systemctl status toxiflow
   ```

4. **Veja os logs:**
   ```bash
   sudo journalctl -u toxiflow -n 50 -f
   ```

### Deploy automático não funciona?

1. Verifique os secrets no GitHub → Settings → Secrets
2. Veja os logs da ação no GitHub Actions
3. Confirme a SSH key está autorizada: `cat ~/.ssh/authorized_keys | grep github`

---

## Próximas Etapas

1. ✅ IP autorizado e serviço rodando
2. ⏳ Você pode fazer login em https://emergencista.tech/toxiflow/admin
3. ⏳ Revisar/aprovar sugestões de atualização de drogas na seção "Revisão clínica"
4. ⏳ Executar SQL para criar tabela de histórico: `supabase/tox_radar_review_queue.sql`
