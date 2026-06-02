You are a senior software architect and technical reviewer. Review the following architecture migration plan for a personal finance system (pi-financeiro).

The system is a WhatsApp-connected finance agent built with:
- Fastify API + PostgreSQL (Docker) — backend
- Pi CLI (pi --mode rpc) — AI agent terminal
- Evolution GO API — WhatsApp integration
- monorepo with pnpm workspaces

The user is pointing out that ~5,000 lines of redundant TypeScript code (tool-registry, process-runner, rpc-client, prompt-builder, ted-prompt, rpc-queue, finance-api-client) were written to do what Pi already provides natively via AGENTS.md, skills/, prompts/, and pi --mode rpc.

Below is the complete migration spec. Review it critically and return:

1. **Diagnosis**: Is the analysis correct? Is ~5k lines truly redundant, or is there value I'm missing?
2. **Risks**: What could go wrong with this refactor?
3. **Edge cases**: What scenarios would break with the new architecture?
4. **Missing pieces**: What's in the current code that Pi native doesn't cover?
5. **Rollback plan**: Is it safe enough?
6. **Migration order**: Is Phase 1→2→3→4 the right sequence?
7. **Verification**: How to confirm the refactor succeeded without WhatsApp messages?
8. **Final verdict**: Proceed as-is, proceed with changes, or rethink entirely?

Return your answer in markdown with clear sections. Be specific and critical — this is an architecture review, not a rubber stamp.

---

## Migration Spec

# Architecture Refactor: Pi-Native Agent Architecture

**Date:** 2026-06-02
**Status:** Draft (for GPT Advisor review)
**Author:** Planner

---

## Executive Summary

The current architecture implements ~4,600 lines of code (packages/tools + apps/pi-rpc-runner) to do what Pi already provides natively via `AGENTS.md`, `skills/`, `prompts/`, and `pi --mode rpc`. The refactor removes all redundant code and replaces it with Pi-native mechanisms, leaving a thin adapter that only bridges WhatsApp ↔ Pi RPC.

### Lines of Code to Remove

| Package | Lines | Replacement |
|---------|-------|-------------|
| `packages/tools/` | 2,209 | `.pi/agent/skills/ted-finance/` |
| `apps/pi-rpc-runner/` | 2,410 | Pi RPC nativo (`pi --mode rpc`) |
| `apps/whatsapp-bridge/pi-rpc-runner-client.ts` | 225 | `pi-bridge.ts` (~60 linhas) |
| `apps/whatsapp-bridge/finance-api-client.ts` | 398 | `curl/fetch` via Pi tool |
| `apps/whatsapp-bridge/rpc-queue.ts` | 121 | Pi RPC nativo |
| **Total removido** | **~5,363** | |

### Lines to Add

| Arquivo | Lines |
|---------|-------|
| `.pi/agent/AGENTS.md` | ~80 |
| `.pi/agent/skills/ted-finance/SKILL.md` | ~120 |
| `.pi/agent/prompts/report.md` | ~30 |
| `apps/whatsapp-bridge/src/pi-bridge.ts` | ~60 |
| **Total adicionado** | **~290** |

---

## Target Architecture

```
WhatsApp → Evolution GO Webhook
              │
              ▼
┌─────────────────────────────────────┐
│  apps/whatsapp-bridge (THIN ADAPTER)│
│                                     │
│  webhook-handler.ts (validar webhook)│
│  pi-bridge.ts (stdin/stdout bridge) │
│  evolution-client.ts (enviar msg)   │
│  message-classifier.ts (classificar)│
└──────────────┬──────────────────────┘
               │ stdin:  {"type":"prompt","message":"..."}
               │ stdout: {"type":"message_update","delta":"..."}
               ▼
┌─────────────────────────────────────┐
│  pi --mode rpc  (TED Agent)         │
│                                     │
│  AGENTS.md  → system prompt         │
│  skills/    → ferramentas           │
│  prompts/   → templates             │
└──────────────┬──────────────────────┘
               │ HTTP (curl/fetch)
               ▼
┌─────────────────────────────────────┐
│  apps/api (Fastify) ← MANTER        │
│  + packages/domain, db, ledger      │
└─────────────────────────────────────┘
```

---

## Phase 1: Foundation — `.pi/agent/` Structure

### 1.1 `.pi/agent/AGENTS.md`

System prompt do agente TED. Define persona, regras, e ferramentas disponíveis.

```
# TED - Agente Financeiro

## Persona
- Nome: TED (The Economic Dashboard)
- Tom: amigável, engraçado, inteligente, prestativo
- Especialidade: dinheiro, organização financeira, alertas, conselhos práticos
- Humor: piadas leves no momento certo, nunca sarcasmo
- Timezone: America/Sao_Paulo, moeda BRL, centavos inteiros

## Regras ANTI-MENTIRA (OBRIGATÓRIAS)
1. NUNCA afirme que uma ação foi concluída sem confirmação explícita da API.
2. Se a API retornar erro, reporte o motivo exato, não invente.
3. Se não tiver certeza, diga que precisa verificar antes de confirmar.
4. Sempre use centavos inteiros (amountCents) para valores.

## Ferramentas Disponíveis

TED usa a API REST em http://localhost:3000 para todas as operações financeiras
via curl/fetch. NUNCA invente dados — sempre consulte a API.

### API Endpoints Principais

#### Criar Despesa
curl -s -X POST http://localhost:3000/records/expense \
  -H "Content-Type: application/json" \
  -d '{"householdId":"<id>","accountId":"<id>","amountCents":5000,"description":"carne","date":"2026-06-02","source":"whatsapp"}'

#### Criar Receita
curl -s -X POST http://localhost:3000/records/income \
  -H "Content-Type: application/json" \
  -d '{"householdId":"<id>","accountId":"<id>","amountCents":50000,"description":"salário","date":"2026-06-02","source":"whatsapp"}'

#### Relatório do Mês
GET /reports/current-month?householdId=<id>

#### Listar Contas
GET /accounts?householdId=<id>

#### Listar Categorias
GET /categories?householdId=<id>

## Fluxo de Interação

1. Usuário envia mensagem → classificar intenção:
   - Se for pedido de relatório → chamar /reports/current-month
   - Se for gasto/receita → perguntar dados faltantes → criar via API
   - Se for conversa normal → responder amigavelmente

2. ANTES de criar qualquer registro, CONFIRMAR com o usuário:
   - Valor, descrição, conta, categoria, data
   - Se valor > R$500, pedir confirmação extra

3. APÓS criar, CONFIRMAR com a API:
   - Se a API retornar sucesso → "✅ Registrado: [detalhes]"
   - Se a API retornar erro → "❌ [motivo]"
```

### 1.2 `.pi/agent/skills/ted-finance/SKILL.md`

Skill do Pi que documenta o fluxo completo de interação financeira.

### 1.3 `.pi/agent/prompts/report.md`

Template de prompt para gerar relatório mensal formatado.

---

## Phase 2: Thin Adapter — `apps/whatsapp-bridge/`

### 2.1 What to KEEP

| File | Reason |
|------|--------|
| `webhook-handler.ts` | Validates webhook, classifies message, coordinates flow |
| `evolution-client.ts` | Sends/receives messages from Evolution GO API |
| `message-classifier.ts` | Classifies message intent |

### 2.2 What to REPLACE

**`pi-rpc-runner-client.ts`** → **`pi-bridge.ts`** (new file, ~60 lines)

The new adapter is radically simpler:
- Spawns `pi --mode rpc` with `--append-system-prompt` pointing to `AGENTS.md`
- Writes message to stdin as `{"type":"prompt","message":"{text}"}`
- Reads response from stdout (events `message_update/agent_end`)
- Returns response text

```typescript
// pi-bridge.ts - ~60 lines
// Only stdin/stdout bridge, NO business logic

import { spawn, ChildProcess } from 'child_process';

export class PiBridge {
  private proc: ChildProcess | null = null;

  start(projectDir: string): void {
    this.proc = spawn('pi', [
      '--mode', 'rpc',
      '--no-session',
      '--append-system-prompt', `${projectDir}/.pi/agent/AGENTS.md`,
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  async send(message: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let response = '';
      const onData = (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n').filter(Boolean)) {
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'message_update' && ev.assistantMessageEvent?.type === 'text_delta') {
              response += ev.assistantMessageEvent.delta;
            }
            if (ev.type === 'agent_end' || ev.type === 'error') {
              cleanup();
              resolve(response);
            }
          } catch {}
        }
      };
      const cleanup = () => {
        this.proc?.stdout?.removeListener('data', onData);
        this.proc?.stderr?.removeListener('data', onError);
      };
      const onError = (chunk: Buffer) => { cleanup(); reject(new Error(chunk.toString())); };
      this.proc?.stdout?.on('data', onData);
      this.proc?.stderr?.on('data', onError);
      this.proc?.stdin?.write(JSON.stringify({ type: 'prompt', message }) + '\n');
    });
  }

  stop(): void { this.proc?.kill(); }
}
```

### 2.3 What to REMOVE

| File | Lines |
|------|-------|
| `pi-rpc-runner-client.ts` | 225 |
| `finance-api-client.ts` | 398 |
| `rpc-queue.ts` | 121 |
| `pi-rpc-client.ts` | 174 |
| **Total** | **918** |

---

## Phase 3: Remove Redundant Packages

### 3.1 `packages/tools/` (2,209 lines)

**All content replaced by:**
- `AGENTS.md` → Defines available tools (persona + rules)
- `skills/ted-finance/` → Documents API usage flows
- `prompts/` → Templates for reports and common operations

**Remove completely:**
- `packages/tools/src/index.ts`
- `packages/tools/src/rpc-queue.ts`
- `packages/tools/src/ted-prompt.ts`
- `packages/tools/src/tool-executor.ts`
- `packages/tools/src/tool-registry.ts`
- `packages/tools/src/tool-result.ts`
- Associated tests

### 3.2 `apps/pi-rpc-runner/` (2,410 lines)

**All content replaced by native `pi --mode rpc`.**

Pi already provides natively:
- `pi --mode rpc` → Process lifecycle, JSONL protocol
- `new_session` → Session management
- `prompt` → Send messages
- `get_state` / `get_messages` → Session state
- `--append-system-prompt` → System prompt injection

**Remove completely:**
- `apps/pi-rpc-runner/src/index.ts`
- `apps/pi-rpc-runner/src/process-runner.ts`
- `apps/pi-rpc-runner/src/rpc-client.ts`
- `apps/pi-rpc-runner/src/rpc-queue.ts`
- `apps/pi-rpc-runner/src/ted-prompt.ts`
- Associated tests

---

## Phase 4: Cleanup

### 4.1 Remove dependencies

- Root `package.json`: remove references to `@pi-financeiro/tools` and `@pi-financeiro/pi-rpc-runner`
- `pnpm-workspace.yaml`: keep (remove references if any)
- `deps.ts` and `app.ts`: remove imports from removed packages

### 4.2 Update tests

- `packages/tools/` and `apps/pi-rpc-runner/` tests will be removed with the packages
- Current ~975 tests include these → final count should drop to ~800-850
- Integration tests (webhook-e2e) must be kept and adapted

---

## Risk and Rollback

| Risk | Mitigation |
|------|-----------|
| TED loses conversation context | AGENTS.md + Pi session maintain context naturally |
| TED doesn't follow correct flow | AGENTS.md explicits rules, skills document flows |
| Webhook stops working | E2e tests validate full flow before deploy |
| Test loss | Keep webhook-handler integration tests |

**Rollback:** `git revert` + `pnpm install` + restart API. Fast and easy.

---

## Implementation Plan

```
Phase 1: .pi/agent/ (AGENTS.md + skills + prompts)           [PRIORITY]
Phase 2: pi-bridge.ts (thin adapter)                          [PRIORITY]
Phase 3: Remove packages/tools/ + apps/pi-rpc-runner/        [AFTER PHASE 1+2]
Phase 4: Cleanup + tests                                      [FINAL]
```

Each phase must be implemented and tested individually.
