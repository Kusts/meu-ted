# V048 legacy-boot decision (deploy)

**Data:** 2026-09-07
**Decisão:** V048 (`V048__category_uniqueness.sql`) permanece FORA de
`LEGACY_SAFE_PREFIXES`. A unicidade de categorias no VPS é entregue por
V049 (`V049__category_uniqueness_legacy.sql`), legado-safe. Nenhuma ação
manual é necessária no VPS.

## Por que não é legacy-safe

V048 deduplica e indiciza `categories` com predicado
`status = 'active' AND deleted_at IS NULL`. O schema legado do VPS
(`DB_SCHEMA=legacy`, banco `pi_financeiro` da era Agent Pi) controla
atividade de categorias com booleano `active` — **não existe coluna
`status`**. Prova: `LEGACY_CATEGORY_COLUMNS` em
`apps/api/src/writes/legacy-postgres.ts` projeta
`id, household_id, name, kind, active, parent_id, icon, color,
sort_order, is_default, is_system`, e o teste de integração
`postgres-legacy-boot-proof` executa o SQL de V048 contra uma tabela com
o shape legado e recebe erro de coluna ausente (`status`), com rollback
limpo. Adicionar V048 à lista faria o boot da API no VPS abortar e a API
não subiria.

## O que acontece no boot do VPS hoje (correto)

1. `server/index.ts` chama `runMigrations(pool, /* legacyOnly */ true)`.
2. `LEGACY_SAFE_PREFIXES` (V003, V008–V012, V032–V035, V040–V047, **V049**)
   é aplicado; V048 nunca é tentado — boot íntegro.
3. V049 deduplica categorias legadas por
   `(household_id, kind, parent, lower(name))` entre `active = true`,
   reponta `transactions.category_id/subcategory_id` e cria o índice único
   `categories_household_kind_parent_name_uidx_legacy`. Em schema canônico
   V049 é no-op (V048 já fez o trabalho).
4. Os adapters legados (`writes/legacy-postgres.ts`) criam categorias e
   aplicam defaults via `INSERT ... ON CONFLICT DO NOTHING + SELECT`
   sobre o índice V049 — a corrida check-then-insert (M-02) está fechada
   no VPS; duplicata concorrente **reusa** a linha viva (sem 409, sem
   duplicação).

## O que NÃO fazer

- **Não** adicione `V048` a `LEGACY_SAFE_PREFIXES` sem antes migrar a
  tabela legada para o shape canônico (`status`, `deleted_at`).
- **Não** rode `migrate-job`/`runMigrations(pool, false)` contra o banco
  de produção legado para "forçar" V048: o modo full aplicaria também
  V013–V043 (identidade Better Auth, workspaces, ownership transfers),
  que reescrevem tabelas de identidade — risco de indisponibilidade e
  perda de compatibilidade com os adapters legados.

## Caminho futuro

Se o banco do VPS for um dia migrado para o schema canônico, V048
aplica sozinha no próximo boot normal (ela já está no manifesto
canônico e é idempotente; V049 vira no-op permanente). Até lá,
qualquer migração `V0xx >= V044` nova precisa entrar em
`LEGACY_SAFE_PREFIXES` ou ganhar justificativa em
`LEGACY_EXCLUDED_JUSTIFICATIONS` — o teste
`tests/db/migrations-integrity.test.ts` ("legacy-safe inventory pin")
quebra caso contrário. Prova viva do caminho legado em
`tests/integration/postgres-legacy-category-proof.test.ts` (dedupe,
convergência concorrente, no-op canônico, ordem de boot legacy).
