# ADR-019 — Fixtures de teste preservadas como exceções de reconciliação fechadas (3 coverage + 2 payables)

**Status:** Aceito
**Data:** 2026-09-18

## Contexto

A triagem read-only pós-deploy V4.1 (`docs/reports/v4.1-reconciliation-triage.md`,
fonte `recon-v41.json` de 2026-09-17T19:09:26Z, `--schema=legacy`) registrou
63 findings, sem nenhum repair executado. Destes, 5 itens do grupo
estritamente ambíguo (§4.3, itens 4–8) foram rotulados pelo usuário como
**dados de teste**:

- **3 `statement_payment` / `payment_coverage_gap`** (triagem §§1–2, §4.3
  itens 4–6): statements com soma paga sem transação `expense`
  correspondente de pagamento de fatura (critério dos detectores
  `detectors.ts:307-319`, base `sql.ts:139-157`). Ciclos, valores e
  descrições constam exclusivamente da triagem e do `recon-v41.json`
  (evidência controlada) e não são repetidos aqui.
- **2 `payable_payment` / `missing_payment_transaction`** (triagem §§1–2,
  §4.3 itens 7–8): payables com `status='paid'` cujo `paid_transaction_id`
  aponta para transação soft-deletada (detector
  `detectors.ts:330-345`). Identidades e links constam exclusivamente da
  triagem e do `recon-v41.json` (evidência controlada) e não são
  repetidos aqui.

O ADR-017 excluiu expressamente anomalias rotuladas como dados de teste do
seu escopo (§Decisão item 3) e deixou o destino delas a definir; suas
consequências citam estes 5 itens como parte dos 8 que seguem exigindo
decisão humana própria. O usuário aprovou agora: **preservar como exceções
de reconciliação fechadas e fingerprinted, sem nenhuma mutação de dados de
produção**.

## Decisão

Os exatos 3 `payment_coverage_gap` e os exatos 2
`missing_payment_transaction` existentes no `recon-v41.json` são uma
**exceção fechada de fixtures de teste**:

1. **Nenhuma mutação de dados de produção sobre este conjunto.** Os §4.3
   (itens 4–8) e §5 (fila humana) da triagem ficam **não autorizados como
   writes** para estes 5 findings: sem restore/un-delete da transação de
   pagamento, sem estorno do payable, sem relink, sem `UPDATE` de
   `status`/`paid_cents`/`total_cents`, sem preenchimento de FK.
2. **Escopo exato e congelado.** A exceção cobre somente os 3 gaps de
   cobertura e os 2 payables pagos com tx deletada à data do JSON de
   2026-09-17. Identidade por allowlist versionada
   (`adr-019-test-fixtures-v1`) de fingerprints SHA-256, sem ids, valores,
   datas ou descrições em claro no código. O fingerprint do gap congela
   ciclo, household, soma paga e ausência de tx correspondente; o do
   payable congela payable, `paid_transaction_id` e estado soft-deletado
   do link.
3. **Escopo de cartão explícito.** Os 3 gaps pertencem ao domínio de
   cartão/fatura (statements e cobertura de pagamento de fatura); os 2
   payables pertencem ao domínio de contas a pagar e **não** são findings
   de cartão — nenhuma exceção deste ADR se estende a `card_purchases`,
   `statement_total` ou `accounts_balance`.
4. **Aplicação legacy-only; canônico nunca suprime.** A supressão por
   fingerprint (`applyTestFixtureExceptions`, `test-fixtures.ts`, chamada
   em `run.ts` com `layout`) vale **somente para layout legado**: runs
   legados globais e do household de teste aprovado exigem exatamente
   3+2; households legados não relacionados esperam zero (a ausência do
   conjunto fechado fora do seu household não é falha). **Runs
   canônicos esperam zero fixtures ADR-019 e nunca suprimem**: linhas de
   cobertura legacy-only estão ausentes por layout (não é drift), e
   qualquer `payment_coverage_gap`/`missing_payment_transaction`
   canônico permanece como drift ativo e reprova o gate.
5. O relatório de triagem permanece como registro histórico fiel do que foi
   observado e proposto — esta decisão o **substitui como autorização**,
   não o reescreve. O ADR-017 permanece intacto (55 itens pré-V033); este
   ADR cobre somente os 5 itens de teste aqui definidos.

## Invariantes

- **Ledger autoritativo para escritas novas.** Toda escrita nova segue os
   invariantes V4.1 (pagamento de fatura gera `expense` correspondente;
   payable pago mantém `paid_transaction_id` vivo; unpay exige
   `paidTransactionId`).
- **Qualquer exceção nova ou alterada é erro/gate.** Novo gap de cobertura,
   novo payable com tx deletada, ou mudança nos 5 itens congelados (ex.:
   tx restaurada, payable estornado, gap ganhando transação
   correspondente) deve reprovar reconciliação/gate, não entrar
   silenciosamente na exceção.
- **Fixtures não contaminam produção.** Dados de teste permanecem
   identificáveis como exceção reconhecida; nenhum fluxo de produção pode
   depender deles como estado válido.

## Consequências

- Os 5 findings permanecem visíveis na reconciliação como exceção conhecida:
  matches exatos saem do conjunto de drift ativo e passam a `recognized`
  (`report.testFixtures`), com contabilidade `checked` preservada — não
  são saúde plena nem backlog de repair.
 - Detectores e gates distinguem "exceção reconhecida" de "novo finding":
   runs legados do household de teste aprovado exigem exatamente 3+2;
   households legados não relacionados esperam zero; **runs canônicos
   esperam zero e nunca suprimem** (supressão guardada por
   `!isCanonicalLayout`; gate `test_fixture_count_mismatch` só existe no
   caminho legado). Linha nova, alterada ou ausente onde esperada
   reprova o gate (`test_fixture_count_mismatch`, `--fail-on-drift` sai
   1), nunca entra silenciosamente na exceção.
 - Rollout: implementação restrita a controle de versão (código de
   reconciliação + testes), sem DML/DDL, sem acesso a produção, sem deploy.
   **Estado atual: fonte implementada não commitada e não implantada**
   (`test-fixtures.ts` com allowlist `adr-019-test-fixtures-v1` +
   `report.testFixtures`, `run.ts` com passagem de `layout`, testes
   `test-fixtures.test.ts`); nenhuma DML/DDL em produção ocorreu e este
   ADR não afirma rollout.
  Rollback: revogar este ADR por novo ADR; a exceção não cria estado em
  produção para desfazer.
- Restam fora de qualquer exceção os findings genuinamente ambíguos de
  produção: 1 saldo negativo (agora regido pelo ADR-018) + 2
  `status_mismatch` (`paid` com `paid_cents=0`, triagem §4.3 itens 2–3),
  que seguem exigindo decisão humana própria.

## Referências

- `docs/reports/v4.1-reconciliation-triage.md` §§1–4.3, §5 (counts,
  causa-raiz, cross-checks, SQLs de verificação — evidência, não
  autorização).
- `docs/adr/ADR-017-pre-v033-historical-exception.md` (§Decisão item 3 e
  Consequências: escopo que este ADR complementa sem alterar).
- `docs/reports/v4.1-release-bridge-execution.md` §4 (totais idênticos aos
  do JSON); `docs/reports/v4.1-canonical-readiness.md`
  (PRONTO PARA PLANEJAR, NÃO PARA EXECUTAR).
