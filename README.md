# ToxiFlow (PWA)

Aplicação web simples (PWA) para suporte rápido em toxicologia.
- Instalável no iPhone (Safari → Compartilhar → Adicionar à Tela de Início)
- Funciona offline após o 1º acesso

## Deploy no Netlify
- Publish directory: `.`
- Build command: (vazio)

## Migrations SQL (automacao no deploy)

O deploy via GitHub Actions agora executa migrations SQL antes do build.

### Secret obrigatorio no GitHub Actions
- `DATABASE_URL` (connection string Postgres do Supabase)

### Como funciona
- Script: `scripts/run-sql-migrations.sh`
- Comando: `npm run db:migrate`
- Ordem atual:
	- `supabase/tox_alerts_sent.sql`
	- `supabase/tox_radar_review_queue.sql`
	- `supabase/admin_audit_logs.sql`

### Execucao manual (opcional)
- `DATABASE_URL='postgresql://...' npm run db:migrate`

### Erro comum no SQL Editor
Se aparecer erro como `syntax error at or near "supabase"`, voce colou o caminho do arquivo em vez do SQL.
No SQL Editor, cole o conteudo completo do arquivo `supabase/tox_radar_review_queue.sql` e execute.

## Hardening para producao

### Variaveis obrigatorias (admin)
- `TOXIFLOW_ADMIN_USERNAME`
- `TOXIFLOW_ADMIN_PASSWORD`
- `TOXIFLOW_ADMIN_SESSION_SECRET`

### Variaveis recomendadas
- `TOXIFLOW_ADMIN_IP_ALLOWLIST` (IPs separados por virgula)
- `TOXIFLOW_TELEGRAM_BOT_TOKEN` (para 2FA)
- `TOXIFLOW_TELEGRAM_CHAT_ID` (para 2FA)

### 2FA por Telegram
- O login admin pode exigir OTP via Telegram quando `TOXIFLOW_TELEGRAM_BOT_TOKEN` e `TOXIFLOW_TELEGRAM_CHAT_ID` estiverem definidos.
- Fluxo: senha correta -> envio OTP -> validacao de codigo.

### Comando Telegram /acesso
- Script: `scripts/poll-telegram-commands.cjs`
- Runner: `scripts/run-telegram-poller.sh`
- Resposta do comando `/acesso`:
	- acessos ToxiFlow desde hoje (00:00)
	- acessos nas ultimas 24h
	- lugares diferentes (IPs unicos nas ultimas 24h)
- Units: `deploy/systemd/toxiflow-telegram-poller.service` e `deploy/systemd/toxiflow-telegram-poller.timer`

### Auditoria
- Arquivo local: `logs/security-audit.log`
- Tabela opcional no Supabase: execute `supabase/admin_audit_logs.sql`

### Backup diario
- Script: `scripts/backup-drugs.cjs`
- Unit files: `deploy/systemd/toxiflow-backup.service` e `deploy/systemd/toxiflow-backup.timer`
- Exemplo de ativacao:
	- `sudo cp deploy/systemd/toxiflow-backup.service /etc/systemd/system/`
	- `sudo cp deploy/systemd/toxiflow-backup.timer /etc/systemd/system/`
	- `sudo systemctl daemon-reload`
	- `sudo systemctl enable --now toxiflow-backup.timer`

### Rotacao de credenciais
- Script: `scripts/rotate-admin-credentials.sh`
- Executa rotacao de `TOXIFLOW_ADMIN_PASSWORD` e `TOXIFLOW_ADMIN_SESSION_SECRET` no unit file e reinicia o servico.
- Rotacao mensal automatica: `deploy/systemd/toxiflow-admin-rotation.service` e `deploy/systemd/toxiflow-admin-rotation.timer`
