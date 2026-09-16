# Categoria XLT — Cross-Layer Invariant Tests

**Origem:** SPEC V4 §18. **Princípio:** SPEC V4 INV-10 — *"Teste verde não
basta isoladamente"*: capabilities que atravessam múltiplas camadas
precisam de pelo menos um teste integrado que valide a combinação real.

## Propósito

Detectar a classe de bug que passa em todo teste isolado: header correto
na constante mas ausente no fio; cookie válido no browser mas barrado no
proxy; reversal correta no código mas fora da transação sob crash; token
hasheado no registro mas verificável pelo valor vazado. O XLT só passa
quando as camadas concordam de verdade.

## Naming

- PWA (Playwright, `apps/pwa/e2e/xlt/`): `xlt-NN-<slug>.spec.ts`
- API (vitest, `apps/api/tests/xlt/`): `xlt-NN-<slug>.test.ts`

`NN` é o ID da tabela abaixo (`00` = fumaça da categoria).

## Localização por camada

| Cenário | Onde mora | Runner |
|---|---|---|
| Browser / headers / build | `apps/pwa/e2e/xlt/` | Playwright (`e2e/xlt/xlt.config.ts`, sem webServer) |
| Postgres / writes / crash | `apps/api/tests/xlt/` | vitest, gated por `DATABASE_URL_TEST` + `DB_TEST_MARKER` (skip limpo sem banco) |
| Config por ambiente | Lado do dono do config (PWA ou API), registrando produção × desenvolvimento × teste | Runner do workspace dono |

## Critério de admissão (um XLT precisa de todos)

1. Atravessa **≥ 2 camadas reais** — config de produção + HTTP emitido;
   browser + headers do build; cookie + proxy + API; SQL real + camada
   de writes; migration + store. Mock de camada intermediária
   desqualifica.
2. Nasce com RED→GREEN local na tarefa do bloco dono; branch volta a
   ficar verde na mesma tarefa (nenhum vermelho atravessa fases).
3. XLTs de Postgres/integração são gated skip-clean (nunca falham por
   falta de infra local; o gate real roda no job dedicado).

## O que NÃO é XLT (regra explícita)

Checks estáticos — grep/AST/contagem de referências sobre o repo, como
`ARCH-V4-06a` (consumidores externos = 0) e `ARCH-V4-06b` (referências
estáticas proibidas = 0) — são **architecture checks** (VAL-V4.9, em
`scripts/` + gate de validação). Não atravessam camadas reais, não
pertencem à categoria, não usam naming `xlt-NN`.

## Tabela SPEC §18 — XLT-01..10 previstos

| ID | Cenário | Localização | Tarefa dona |
|---|---|---|---|
| XLT-01 | TED mic enabled + built HTTP headers + browser → recording works | `apps/pwa/e2e/xlt/` | T1.2 |
| XLT-02 | login → HttpOnly cookie → same-origin proxy → API authenticated → no reusable localStorage bearer | `apps/pwa/e2e/xlt/` | T2.2/T2.3 |
| XLT-03 | production config → localhost rejected | lado do config | T2.7 |
| XLT-04 | development config → localhost allowed | lado do config | T2.7 |
| XLT-05 | browser → cannot directly reach forbidden backend origin under production CSP | `apps/pwa/e2e/xlt/` | T2.7 |
| XLT-06 | pós-descomissionamento: PWA → rota canônica → FinanceChatAgent funcional, `/agents/workspace/*` ausente, sem fallback involuntário | `apps/pwa/e2e/xlt/` | T4.3 |
| XLT-07 | undo crash injection → at-most-one financial reversal | `apps/api/tests/xlt/` | T3.1 |
| XLT-08 | offline session > maxOfflineAge → financial snapshot locked | `apps/pwa/e2e/xlt/` | T2.6 |
| XLT-09 | logout → cookie/session invalid → snapshot cleared → Agent session cleared | `apps/pwa/e2e/xlt/` | T2.6 |
| XLT-10 | device token database leak → stored value alone cannot authenticate | `apps/api/tests/xlt/` | T2.4 |

XLT-00 (fumaça: config de segurança → header emitido) já existe como
prova executável da convenção e foi criado na T0.2 junto com a
infraestrutura.

## Convenções detalhadas

- PWA: `apps/pwa/e2e/xlt/README.md`
- API: `apps/api/tests/xlt/README.md`
