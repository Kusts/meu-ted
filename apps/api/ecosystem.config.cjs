// PM2 process config for meu-ted-api.
// Mirrors `pnpm start` (node --import tsx src/server/index.ts).
// Env is loaded by the app itself from .env (see src/env.ts loadDotEnv).
// Usage: pm2 start ecosystem.config.cjs  |  pm2 save
module.exports = {
  apps: [
    {
      name: 'meu-ted-api',
      script: 'src/server/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: __dirname,
      autorestart: true,
      // Boot resilience: Postgres (Docker) may not be ready when the API
      // starts on login. Back off exponentially and keep retrying instead
      // of giving up after a handful of fast crash-loops.
      exp_backoff_restart_delay: 1000,
      min_uptime: 10000,
      max_restarts: 50,
      max_memory_restart: '512M',
    },
    {
      // Cloudflare Tunnel que expõe a API em https://api.synkroo.com.br.
      // Sob PM2 para ter o mesmo autorestart/persistência do backend, em vez de
      // um processo solto. Roda o exe direto (interpreter 'none').
      name: 'cloudflared-tunnel',
      script: 'C:\\Users\\walis\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\\cloudflared.exe',
      // NOTE: o nome do túnel Cloudflare ('pi-finance-api') é identidade de
      // produção e permanece inalterado (troca exige painel Cloudflare + VPS).
      args: 'tunnel run pi-finance-api',
      interpreter: 'none',
      autorestart: true,
      exp_backoff_restart_delay: 1000,
      min_uptime: 10000,
      max_restarts: 50,
    },
  ],
};
