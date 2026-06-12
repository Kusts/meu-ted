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
curl http://localhost:3000/health
# → {"status":"ok"}

# Ver logs
docker compose -f docker/pi-stack/docker-compose.yml logs -f

# Verificar Pi acessível
docker compose -f docker/pi-stack/docker-compose.yml exec pi-stack pi --version

# Parar
docker compose -f docker/pi-stack/docker-compose.yml down
```

## Healthcheck

O compose inclui healthcheck que valida `GET /health` a cada 10s.
O bridge responde `{"status":"ok"}` imediatamente — warmup do Pi
acontece em background após o HTTP estar no ar e não bloqueia health.

## Troubleshooting

### `curl` retorna empty reply ou connection refused
O container ainda não subiu. Aguarde ~15s (start_period do healthcheck).
Verifique com: `docker compose -f docker/pi-stack/docker-compose.yml ps`

### `pnpm install` falha com `ERR_PNPM_IGNORED_BUILDS`
Versão do pnpm do container é incompatível com o lockfile do host.
No Dockerfile, pnpm está pinned em `10.34.1`. Rebuild: `docker compose build --no-cache`.

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
| `PORT` | `3000` | `3000` |

## Estrutura do container

```
container (pi-stack)
├── /workspace/.pi/                  → contrato do agente
├── /workspace/apps/whatsapp-bridge/ → bridge Node.js
├── /usr/local/bin/pi                → Pi CLI global
└── host.docker.internal             → Postgres, Evolution API
```