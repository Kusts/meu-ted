# Pi Stack — Pi + WhatsApp Bridge no mesmo container

Container com bridge Node.js + Pi agent rodando juntos.
O Pi é invocado pelo bridge via `RpcClient` (subprocess stdin/stdout).
Banco de dados Postgres acessado via `host.docker.internal`.

## Requisitos

- Docker Desktop (Windows)
- Postgres rodando com banco `pi_financeiro`
- Evolution API (WhatsApp) rodando no host (opcional)

## Variáveis obrigatórias

⚠️ **Segurança:** `.env.pi` contém `MINIMAX_API_KEY` e outras credenciais.
Nunca comite `.env.pi` no git. Ele já está no `.gitignore` do projeto.

O compose usa defaults que funcionam com o projeto local.
Para sobrescrever, exporte as vars antes de rodar o compose:

```bash
export DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:5432/pi_financeiro"
export EVOLUTION_GO_API_URL="http://host.docker.internal:4000"
export EVOLUTION_GO_INSTANCE_TOKEN="seu-token-aqui"
```

Ou use `.env.pi` com `--env-file`:

```bash
docker compose -f docker/pi-stack/docker-compose.yml --env-file .env.pi up -d
```

**Nota:** `localhost` no seu `.env` vira `host.docker.internal` dentro do container.

## Uso

```bash
# Build
docker compose -f docker/pi-stack/docker-compose.yml build

# Subir container (bridge HTTP sobe automaticamente)
docker compose -f docker/pi-stack/docker-compose.yml up -d

# Verificar se o bridge está respondendo
curl http://localhost:3945/health
# → {"status":"ok"}

# Ver logs
docker compose -f docker/pi-stack/docker-compose.yml logs -f

# Verificar Pi acessível
docker compose -f docker/pi-stack/docker-compose.yml exec pi-stack pi --version

# Parar
docker compose -f docker/pi-stack/docker-compose.yml down
```

## Healthcheck

O compose inclui healthcheck que valida `GET /health` na porta `3945` a cada 10s.
O bridge responde `{"status":"ok"}` imediatamente — warmup do Pi
acontece em background após o HTTP estar no ar e não bloqueia health.

## Troubleshooting

### `curl` retorna empty reply ou connection refused
O container ainda não subiu. Aguarde ~15s (start_period do healthcheck).
Verifique com: `docker compose -f docker/pi-stack/docker-compose.yml ps`

### `pnpm install` falha com `ERR_PNPM_IGNORED_BUILDS`
Versão do pnpm do container é incompatível com o lockfile do host.
No Dockerfile, pnpm está pinned em `10.34.1`. Rebuild: `docker compose build --no-cache`.

### `node_modules` do host quebra depois de subir Docker
O compose usa volumes nomeados para `/workspace/node_modules` e
`/workspace/apps/whatsapp-bridge/node_modules`, isolando dependências Linux do
container das dependências Windows do host.

### Pi agent não responde (PI_AGENT_RUNTIME=pi-native)
Verifique `MINIMAX_API_KEY` no `.env.pi` e `PI_RPC_PROVIDER`.
Logs: `docker compose logs -f | grep -i pi`

### Bridge lento na primeira requisição
Normal — Pi client faz warmup em background na primeira chamada.
Warmup não bloqueia `/health` mas pode afetar `/webhooks/evolution` na primeira vez.

## Env vars completas

| Var | Exemplo | Padrão |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@host.docker.internal:5432/pi_financeiro` | (projeto local) |
| `EVOLUTION_GO_API_URL` | `http://host.docker.internal:4000` | `http://host.docker.internal:4000` |
| `EVOLUTION_GO_INSTANCE_NAME` | `ted` | `ted` |
| `EVOLUTION_GO_INSTANCE_TOKEN` | `seu-token` | vazio |
| `MINIMAX_API_KEY` | `sk-...` | vazio (preencher no `.env.pi`) |
| `PI_AGENT_RUNTIME` | `pi-native` / `disabled` | `pi-native` |
| `PI_RPC_PROVIDER` | `minimax` | `minimax` |
| `PI_RPC_MODEL` | `MiniMax-M2.7:off` | `MiniMax-M2.7:off` |
| `PI_RPC_TIMEOUT_MS` | `120000` | `120000` |
| `DEFAULT_HOUSEHOLD_ID` | `default` | `default` |
| `PORT` | `3945` | `3945` |
| `WATCHDOG_INTERVAL_MS` | `60000` | `60000` |
| `WATCHDOG_MAX_RECONNECT_ATTEMPTS` | `3` | `3` |
| `WATCHDOG_BACKOFF_MS` | `8000` | `8000` |
| Porta exposta no host | `3945` | definida em `ports: "3945:3945"` no compose |

## Evolution Watchdog

Serviço auxiliar (`pi-watchdog`) que monitora a saúde da instância Evolution GO
e reconecta automaticamente quando detecta desconexão.

**Como funciona:**
- Polling periódico em `GET /instance/status` (padrão: 60s)
- Critério de saúde: `Connected === true && LoggedIn === true`
- Se unhealthy → chama `POST /instance/reconnect` com retry e backoff (3 tentativas, 8s entre elas)
- Para de tentar se a saúde for restaurada

**Env vars:**

| Var | Exemplo | Padrão |
|---|---|---|
| `EVOLUTION_GO_API_URL` | `http://host.docker.internal:4000` | `http://localhost:4000` |
| `EVOLUTION_GO_INSTANCE_TOKEN` | `seu-token` | (obrigatória) |
| `WATCHDOG_INTERVAL_MS` | `60000` | `60000` |
| `WATCHDOG_MAX_RECONNECT_ATTEMPTS` | `3` | `3` |
| `WATCHDOG_BACKOFF_MS` | `8000` | `8000` |

**Logs:**
```bash
docker compose -f docker/pi-stack/docker-compose.yml logs -f pi-watchdog
```

**Rodar standalone (sem Docker):**
```bash
cd apps/whatsapp-bridge
EVOLUTION_GO_INSTANCE_TOKEN=seu-token npm run watchdog
```

## Estrutura do container

```
container (pi-stack)
├── /workspace/.pi/                  → contrato do agente
├── /workspace/apps/whatsapp-bridge/ → bridge Node.js
├── /usr/local/bin/pi                → Pi CLI global
└── host.docker.internal             → Postgres, Evolution API
```