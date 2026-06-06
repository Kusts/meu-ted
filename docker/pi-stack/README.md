# Pi Stack — Pi + WhatsApp Bridge no mesmo container

Container com bridge Node.js + Pi agent rodando juntos.
O Pi é invocado pelo bridge via `RpcClient` (subprocess stdin/stdout).
Banco de dados Postgres acessado via `host.docker.internal`.

## Requisitos

- Docker Desktop (Windows)
- Postgres rodando com banco `pi_financeiro`
- Evolution API (WhatsApp) rodando no host (opcional)

## Variáveis obrigatórias

O compose usa defaults que funcionam com o projeto local.
Para sobrescrever, exporte as vars antes de rodar o compose:

```bash
# Ajuste DATABASE_URL se seu banco tiver credenciais diferentes
export DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:5432/pi_financeiro"

# Ajuste Evolution API se a porta/IP for diferente
export EVOLUTION_GO_API_URL="http://host.docker.internal:4000"
export EVOLUTION_GO_INSTANCE_TOKEN="seu-token-aqui"
```

Ou crie `.env.pi` com todas as vars e use `--env-file`:

```bash
docker compose -f docker/pi-stack/docker-compose.yml --env-file .env.pi up -d
```

**Nota:** `localhost` no seu `.env` vira `host.docker.internal` dentro do container.

## Uso

```bash
# Build
docker compose -f docker/pi-stack/docker-compose.yml build

# Subir container
docker compose -f docker/pi-stack/docker-compose.yml up -d

# Verificar Pi acessível
docker compose -f docker/pi-stack/docker-compose.yml exec pi-stack pi --version

# Testar RPC (resposta do Pi)
docker compose -f docker/pi-stack/docker-compose.yml exec pi-stack bash -c \
  'cd /workspace/apps/whatsapp-bridge && npx tsx --input-type=module -e "
import { createPiClient } from \"./src/pi-client-factory.js\";
const c = createPiClient(\"default\");
await c.warmup();
const r = await c.send(\"Liste contas\", \"+\", {source:\"t\",chatId:\"t\",providerMessageId:\"t\"});
console.log(r.success, r.data?.message?.substring(0,200));
await c.stop();
"'

# Parar
docker compose -f docker/pi-stack/docker-compose.yml down
```

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
