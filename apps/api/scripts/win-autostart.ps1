# pi-finance-api - bootstrap de logon (Windows)
# Registrado como Tarefa Agendada "pi-finance-stack" (trigger: AtLogOn).
#
# Sobe todo o stack via `pm2 resurrect`: o dump salvo por `pm2 save` contem os
# dois apps do ecosystem.config.cjs -- o backend (pi-finance-api) e o Cloudflare
# Tunnel (cloudflared-tunnel). Ambos tem autorestart, entao o daemon PM2 os
# mantem vivos depois disto. Postgres (Docker) pode demorar; o backoff aguarda.
# Idempotente: rodar de novo nao duplica processos.
$ErrorActionPreference = 'SilentlyContinue'

$pm2 = Join-Path $env:APPDATA 'npm\pm2.cmd'
if (Test-Path $pm2) { & $pm2 resurrect }
