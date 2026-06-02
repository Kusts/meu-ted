# Architecture Refactor: Pi-Native Agent Architecture

**Date:** 2026-06-02
**Status:** Reviewed by GPT Advisor ✅ — Proceed with changes
**Author:** Planner
**Reviewer:** ChatGPT Advisor (GPT-4) — critical review applied

---

## Executive Summary

The current architecture has ~4,600 lines of custom Pi harness code (packages/tools + apps/pi-rpc-runner) that overlap with what Pi provides natively. However, **not all of it is redundant** — the finance safety layer (validation, idempotency, typed API client, webhook deduplication, pending operations) must be preserved.

### What's Actually Redundant

| Camada | O que remove | Motivo |
|--------|-------------|--------|
| **Pi Process Runner** | `apps/pi-rpc-runner/process-runner.ts` | Pi `--mode rpc` gerencia processo nativamente |
| **JSONL Client** | `apps/pi-rpc-runner/rpc-client.ts` | Pi RPC já tem protocolo stdin/stdout |
| **RPC Queue** | `apps/pi-rpc-runner/rpc-queue.ts` | Pi gerencia fila de prompts nativamente |
| **Prompt Builder** | `apps/pi-rpc-runner/ted-prompt.ts`, `packages/tools/ted-prompt.ts` | AGENTS.md substitui |
| **Tool Registry** | `packages/tools/tool-registry.ts` | Skills + Pi extension substituem |
| **Tool Executor** | `packages/tools/tool-executor.ts` | Substituído por Pi extension ou CLI helper |
| **Tool Result** | `packages/tools/tool-result.ts` | Substituído por tipos da extensão |
| **Total removido** | **~3,000 linhas** de harness redundante | |

### What Must STAY (refatorado/comprimido)

| Componente | O que faz | Preservar como |
|-----------|-----------|----------------|
| **Finance API Client** | Chamadas tipadas para API REST | Pi extension com tools financeiras |
| **Webhook Dedup** | Idempotência de webhooks Evolution | Manter no adapter |
| **Message Classifier** | Classifica intenção da mensagem | Manter no adapter |
| **Pending Operations** | Estado de confirmação multi-mensagem | NOVA tabela `pending_operations` |
| **Contract Tests** | Testes de comportamento financeiro | Expandir com golden tests |

---

## Target Architecture (Corrigida)

```
WhatsApp → Evolution GO Webhook
              │
              ▼
┌──────────────────────────────────────────────────┐
│  apps/whatsapp-bridge (THIN ADAPTER + SAFETY)    │
│                                                  │
│  webhook-handler.ts      → valida + classifica   │
│  pi-bridge.ts            → stdin/stdout com       │
│                            JSONL buffer, request  │
│                            IDs, timeout, restart   │
│  evolution-client.ts     → envia resposta         │
│  message-classifier.ts   → classifica intenção    │
│  pending-store.ts        → estado de confirmação  │
│                            (NOVO)                 │
└──────────────┬───────────────────────────────────┘
               │ stdin:  {"type":"prompt","message":"..."}
               │ stdout: {"type":"message_update","delta":"..."}
               ▼
┌──────────────────────────────────────────────────┐
│  pi --mode rpc  (TED Agent)                       │
│                                                    │
│  .pi/AGENTS.md           → system prompt           │
│  .pi/skills/ted-finance  → skill financeira        │
│  .pi/prompts/report.md   → template de relatório   │
│                                                    │
│  TED usa tools FINANCEIRAS determinísticas         │
│  (Pi extension), NÃO curl livre                    │
└──────────────┬───────────────────────────────────┘
               │ create_expense, create_income,
               │ get_report... (typed, validated)
               ▼
┌──────────────────────────────────────────────────┐
│  apps/api (Fastify) — MANTER                      │
│  + packages/domain, db, ledger                    │
└──────────────────────────────────────────────────┘
```

---

## Phase 0: Inventory (ANTES de qualquer mudança)

Classificar cada arquivo a ser removido em:

| Categoria | Ação |
|-----------|------|
| **A. Harness duplicado** | Remover com segurança |
| **B. Regra de negócio financeira** | Preservar na extensão |
| **C. Transporte/webhook** | Manter no adapter |
| **D. Teste/helper** | Manter ou migrar |

### Classificação

**`packages/tools/`**
- `tool-registry.ts` → A (harness)
- `tool-executor.ts` → A+B (harness + regras → extrair regras para extensão)
- `ted-prompt.ts` → A (harness)
- `rpc-queue.ts` → A (harness)
- `tool-result.ts` → A (harness)
- Testes → D (migrar para testar extensão)

**`apps/pi-rpc-runner/`**
- `process-runner.ts` → A (harness)
- `rpc-client.ts` → A (harness)
- `rpc-queue.ts` → A (harness)
- `ted-prompt.ts` → A (harness)
- `index.ts` → A (harness)
- Testes → D (remover junto)

**`apps/whatsapp-bridge/`**
- `webhook-handler.ts` → C (manter)
- `evolution-client.ts` → C (manter)
- `message-classifier.ts` → C (manter)
- `pi-rpc-runner-client.ts` → A (substituir por pi-bridge.ts)
- `finance-api-client.ts` → B (recriar como extensão Pi)
- `rpc-queue.ts` → A (remover)

---

## Phase 1: Golden Tests (congelar comportamento)

Antes de qualquer refatoração, criar testes que congelam o comportamento esperado:

### Testes de Prompt → Resposta + DB

```typescript
// Teste: despesa simples com confirmação
// Input: "gastei 35,90 no mercado hoje no Nubank"
// Assert:
//   - TED pergunta confirmação OU cria após confirmação
//   - amountCents = 3590
//   - description contém "mercado"
//   - source = "whatsapp"
//   - exatamente 1 registro no DB
```

### Matriz de Regressão Mínima

| Caso | Expected |
|------|----------|
| Despesa simples | Pede confirmação ou cria após confirmação explícita |
| Conta faltando | Pergunta uma coisa de cada vez |
| Valor alto > R$500 | Pede confirmação extra |
| Webhook duplicado | Cria apenas um registro |
| API 400 | Reporta o erro de validação exato |
| API 500 | Não afirma sucesso |
| Pedido de relatório | Lê da API, não inventa totais |
| Dois usuários simultâneos | Sem confirmação cruzada |
| Reinício antes do "sim" | Operação pendente ainda recuperável |
| Transferência entre contas | Não classifica como despesa |
| Compra no cartão | Vai para lógica de fatura |
| Parcelamento | Cria parcelas corretas ou pergunta campos faltantes |

---

## Phase 2: Pi-Bridge Robusto (feature flag)

Criar `apps/whatsapp-bridge/src/pi-bridge.ts` (200-500 linhas) com:

- ✅ Buffer JSONL persistente (não split por chunk)
- ✅ Request IDs para correlação
- ✅ Tratamento de eventos: `message_update`, `turn_end`, `agent_end`, `error`
- ✅ Timeout por requisição
- ✅ Abort
- ✅ Restart automático em caso de crash
- ✅ Health check periódico
- ✅ Serialização por chat (fila por remetente)
- ✅ Tratamento de stderr (logs vs erros fatais)
- ✅ Structured logging

### Feature Flag

```env
FINANCE_AGENT_RUNTIME=legacy    # default, mantém código atual
# FINANCE_AGENT_RUNTIME=pi-native  # experimental
```

O `webhook-handler.ts` usa a flag para escolher entre `PiRpcRunnerClient` (legacy) e `PiBridge` (novo).

---

## Phase 3: Extensão Pi com Tools Financeiras (NÃO curl livre)

Criar uma **Pi extension** em `.pi/extensions/ted-finance.ts` que registra tools determinísticas:

```typescript
// Tools expostas para o TED:
// create_expense(amountCents, description, accountId, date, categoryId?)
// create_income(amountCents, description, accountId, date, categoryId?)
// create_transfer(fromAccountId, toAccountId, amountCents, date)
// get_current_month_report(householdId)
// list_accounts(householdId)
// list_categories(householdId)
// confirm_pending_operation(id)
// cancel_pending_operation(id)
// find_account(name)
// find_category(name)
```

Cada tool:
- Valida schemas com tipos
- Gera idempotency key
- Chama API Fastify via HTTP
- Retorna `{success, data, reason}` estruturado
- Registra em audit log

**Alternativa mais simples (se extensão Pi for complexa demais):**
Criar um **CLI helper local** (`packages/finance-cli/`) que o Pi chama via `bash`:

```bash
node packages/finance-cli/bin/ted.js create-expense \
  --amount-cents 3590 \
  --description "carne" \
  --account-id "nubank-id" \
  --date 2026-06-02
```

O CLI helper é determinístico, validado, e o Pi só pode chamar comandos específicos (não curl livre).

---

## Phase 4: Pending Operations (estado durável)

Nova tabela no PostgreSQL para operações pendentes de confirmação:

```sql
CREATE TABLE pending_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  user_phone TEXT NOT NULL,
  operation_type TEXT NOT NULL, -- 'expense', 'income', 'transfer', 'card_purchase'
  draft_payload JSONB NOT NULL,
  confirmation_level INTEGER NOT NULL DEFAULT 0, -- 0=aguardando, 1=confirmação simples, 2=valor alto
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | cancelled | expired
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 hour'
);
```

---

## Phase 5: Shadow Mode

Rodar novo arquitetura em **modo shadow** antes de cortar:

```
FINANCE_AGENT_RUNTIME=pi-native
FINANCE_WRITE_MODE=shadow
```

Em shadow mode:
- Pi processa a mensagem normalmente
- Tools financeiras VALIDAM o payload mas NÃO escrevem no DB real
- Log da ação que seria tomada vs ação real do legacy
- Comparação manual antes de ativar escrita

---

## Phase 6: Switch Traffic

1. 🔴 Ativar escrita para número do **próprio planner**
2. 🟡 Ativar para **Ingrid**
3. 🟢 Ativar para **todos**
4. 🗑️ Remover código legacy após 1 semana sem incidentes

---

## Phase 7: Cleanup

Remover pacotes redundantes APENAS após switch estável:

- `packages/tools/` (todo)
- `apps/pi-rpc-runner/` (todo)
- `apps/whatsapp-bridge/pi-rpc-runner-client.ts`
- `apps/whatsapp-bridge/rpc-queue.ts`
- Atualizar `package.json` e imports

---

## Rollback Plan (Corrigido)

1. Manter código legacy intacto durante Phase 1-5
2. Feature flag `FINANCE_AGENT_RUNTIME=legacy` restaura comportamento 100%
3. Shadow mode garante que nenhum dado corrompido foi escrito
4. Se algo der errado: `FINANCE_AGENT_RUNTIME=legacy` + restart API
5. Só deletar código legacy após 1 semana estável

---

## Resumo das Fases

| Fase | O que faz | Duração estimada | Risco |
|------|-----------|-----------------|-------|
| **0** | Inventário + classificação | 30min | ✅ Nenhum |
| **1** | Golden tests (congelar comportamento) | 2h | ✅ Nenhum |
| **2** | Pi-bridge robusto + feature flag | 3h | ⚠️ Baixo (flag desligada) |
| **3** | Extensão/CLI financeiro determinístico | 4h | ⚠️ Baixo (só chamado pelo novo) |
| **4** | Tabela pending_operations | 1h | ✅ Nenhum |
| **5** | Shadow mode + dry-run | 2h | ✅ Nenhum (só observa) |
| **6** | Switch gradual de tráfego | 1h | ⚠️ Médio (monitorar) |
| **7** | Cleanup (remover código legacy) | 1h | ✅ Baixo (código não usado) |
| **Total** | | **~14.5h** | |

---

## Decisão Final (após revisão GPT)

✅ **Proceed with changes — not as-is, not rethink entirely.**

A direção arquitetural está correta:
- Remover harness customizado do Pi
- Usar RPC/skills/prompts nativos do Pi
- Manter adapter fino
- Manter Fastify/PostgreSQL como fonte da verdade

MAS:
- ❌ ~~Substituir finance-api-client por curl~~ → Criar extensão/CLI determinística
- ❌ ~~pi-bridge em 60 linhas~~ → 200-500 linhas com safety
- ❌ ~~--no-session~~ → Sessão contínua
- ❌ ~~Big bang~~ → Feature flag + shadow + switch gradual
