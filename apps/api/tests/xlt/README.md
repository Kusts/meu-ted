# XLT — Cross-Layer Invariant Tests (API)

Contraparte server-side da categoria permanente (SPEC V4 §18, INV-10).
Mesma regra da PWA: cada XLT atravessa **≥ 2 camadas reais** (ex.: SQL
real + camada de writes; migration aplicada + store; HTTP da app +
Postgres). Teste de store isolado com mock é unit/integration — não
entra aqui.

## Naming

`xlt-NN-<slug>.test.ts` — `NN` é o ID da SPEC §18 (`07` = undo crash,
`10` = device-token leak). Os XLTs nascem na tarefa do bloco dono
(T3.1, T2.4), cada um com RED→GREEN local.

## Gate de banco real (obrigatório para XLTs de Postgres/integração)

Mesmo padrão de `tests/integration/postgres-undo.test.ts`: skip limpo
quando não há banco de teste — nunca falha por falta de infra.

```ts
const DB_URL = process.env.DATABASE_URL_TEST;
const MARKER = process.env.DB_TEST_MARKER;
const ENABLED = Boolean(DB_URL && MARKER);
const describeIfDb = ENABLED ? describe : describe.skip;
```

- Sem `DATABASE_URL_TEST` + `DB_TEST_MARKER` o arquivo passa em skip;
  o gate que exige Postgres real roda no job dedicado (mesmo mecanismo
  do job `postgres` do CI), nunca no `pnpm test` padrão.
- O banco de teste deve conter a marker row esperada; o guard roda
  antes de migrations ou cleanup (nunca apontar para banco de produção).

## Critério de admissão

1. ≥ 2 camadas reais atravessadas (a injeção de crash conta como camada
   de falha real somente contra Postgres de verdade — nunca in-memory).
2. Gated skip-clean por `DATABASE_URL_TEST` + `DB_TEST_MARKER` quando
   tocar Postgres/rede.
3. Checks estáticos NÃO são XLT (são *architecture checks*, VAL-V4.9,
   em `scripts/`).

## Mapa SPEC §18 → arquivo (API)

| ID | Arquivo (futuro) | Dono |
|---|---|---|
| XLT-07 | `xlt-07-undo-crash.test.ts` — crash nos 5 pontos → ≤1 efeito + replay convergente | T3.1 |
| XLT-10 | `xlt-10-device-token-leak.test.ts` — valor do banco sozinho não autentica | T2.4 |

Detalhe canônico da categoria: `docs/testing/xlt-category.md`.
