# Plano — Canonical Cutover (rascunho para aprovação)

**Status:** PROPOSTO — aguarda aprovação do owner. Nenhum passo foi executado.
**Pré-requisitos já satisfeitos (SPEC §21):** V4.1 Closure DONE (PR #11/#12; produção `d5ba79d` nos 3 apps) · reconciliação compreendida (1 finding conhecido, dossier pronto) · nenhum drift novo inexplicado · rollback comprovado (tag `rollback-pre-d5ba79d` + rehearsal de backup-restore).

## Objetivo

Migrar a produção do schema `legacy` para o `canonical` (DB_SCHEMA=canonical), eliminando a dupla manutenção de stores e o gap estrutural entre os dois layouts, sem perda de dados financeiros e com rollback provado.

## Ferramentas existentes (não recriar)

- `apps/api`: `pnpm canonical:preflight` (conversão, dry-read), `migrate-job.js` com filtro `LEGACY_SAFE_PREFIXES`, runner canonical completo.
- `scripts/rehearse-migration.mjs` (`--dry-run` validado) + `backup-restore-rehearsal.test.mjs` (PostgreSQL descartável, dump íntegro, contagens).
- Suites de paridade: `postgres-canonical-parity-v41`, `v4.1-canonical-parity.md`, `v4.1-canonical-readiness.md` (baseline "PRONTO PARA PLANEJAR").
- Reconciliação read-only com layout `auto` (`--schema=auto|legacy|canonical`).

## Fases (cada uma com gate explícito)

**F0 — Decisões do owner (bloqueante)**
- Decidir o finding `814332c4` (dossier pronto) — a conversão não deve herdar finding ambíguo.
- Aprovar janela de manutenção (o cutover tem downtime curto do write-path).
- Autorizar execução por escrito (este plano é só o contrato).

**F1 — Pendências de schema em produção (sem troca de modo)**
- Aplicar V055–V057 via `migrate-job.js` (hoje pendentes; o binário atual já as contém).
- Gate: reconciliação `--schema=legacy` sem `new-regression`; `/health`/`/ready` estáveis.

**F2 — Rehearsal completo em cópia**
- Dump de produção → restore em PostgreSQL descartável (mesma prova do `backup-restore-rehearsal`).
- Executar conversão canonical na cópia + `canonical:preflight` + suites de paridade contra a cópia.
- Gate: contagens idênticas (contas/categorias/transações), paridade 100%, zero divergência de saldos.

**F3 — Congelamento e conversão em produção**
- Backup verificado pré-conversão (`BACKUP_ID` em `_migration_backup_marker`).
- Janela: writes pausados (flag/env ou breve stop da API) → conversão → smoke read/write mínimo.
- Gate: `/health` gitSha inalterado, `/ready` 200, conversão idempotente confirmada, contagens produção = rehearsal.

**F4 — Troca de modo**
- `DB_SCHEMA=canonical` no serviço da API → `docker compose up -d` → XLTs de smoke + reconciliação `--schema=canonical`.
- Gate: 24–48h em canonical com 0 drift novo e 0 `baseline_drift`; PWA/Agent não mudam (API é a fronteira).

**F5 — Pós-cutover**
- Duplo-run de reconciliação (legacy×canonical) por 7 dias.
- Remoção programada dos stores legacy + débito `V1→V2 pending-ops` reavaliado.
- Rollback: `DB_SCHEMA=legacy` + restore do dump pré-conversão (rota ensaiada na F2).

## Riscos conhecidos

- V055–V057 em legacy precisam validação do filtro `LEGACY_SAFE_PREFIXES` na F1 (o V056/V057 tocam `transactions`/`statements` — colunas aditivas; legacy não as usa no write-path).
- Histórico legado com peculiaridades (63 findings antigos, statement totals) — a conversão precisa das decisões de repair do owner OU preservação fiel para a cópia canonical (preferência: preservar fiel, reparar depois no canonical).
- Downtime do write-path na F3 (minutos, proporcional ao tamanho do dump).

## O que este plano NÃO cobre

- Release B do bearer (gate próprio, 2026-10-02).
- Repairs financeiros (autorização por finding, dossier `814332c4` pronto).
