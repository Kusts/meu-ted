# ADR-020 — Reparo dos 2 `status_mismatch` (`paid` com `paid_cents=0`): reabrir como `open`

**Status:** Aceito
**Data:** 2026-09-19

## Contexto

A triagem read-only pós-deploy V4.1 (`docs/reports/v4.1-reconciliation-triage.md`
§§1–2, §4.3 itens 2–3) registrou 2 findings `statement_payment` /
`status_mismatch`: statements com `status='paid'` e `paid_cents=0`
(detector `detectors.ts:320-328`, primeiro ramo `paid` com
`paid_cents < total_cents`). A triagem classificou o par como ambíguo
(status correto é `paid` com baixa faltante, ou `open` com status
errado?) e pediu decisão humana — mudar status altera semântica
financeira.

Os ADRs 017/018/019 já fecharam os demais grupos (55 históricos
pré-V033, saldo negativo bank/cash, 5 fixtures de teste). Estes 2
`status_mismatch` são os únicos findings de produção ainda sem decisão,
e o owner decidiu nesta sessão: **reabrir os dois statements como
pendentes (`open`)**.

## Decisão

1. **Semântica do reparo.** Cada um dos dois statements alvo transiciona
   `paid` → `open`, sem tocar `total_cents` nem `paid_cents` (que já é
   0). Reabrir como pendente é a leitura conservadora: desfaz a
   afirmação falsa de "pago" sem inventar nenhum valor de baixa.
2. **Mecanismo controlado, local e idempotente.**
   `apps/api/src/scripts/reconciliation/repair-statement-status-mismatch.ts`
   (versão `adr-020-statement-status-mismatch-v1`), coberto por
   `apps/api/tests/reconciliation/repair-statement-status-mismatch.test.ts`:
   - **Dry-run padrão, sem write.** Sem `--apply`, o comando só lê e
     reporta elegibilidade por alvo.
   - **Apply exige flag explícita e exatamente dois UUIDs distintos**
     (`--apply --statement=<uuid> --statement=<uuid>`); qualquer outro
     conjunto é erro de uso (saída 2).
   - **Guarda por alvo:** só muda quem ainda for `status='paid'` **e**
     `paid_cents=0` (`SELECT … FOR UPDATE` + `UPDATE … WHERE status =
     'paid' AND paid_cents = 0`). Alvo ausente ou divergente aborta
     **toda** a operação com rollback — nada é escrito parcialmente.
   - **Transacional e idempotente:** uma transação única; reexecução
     após sucesso falha fechada (alvos já `open`, guarda recusa), sem
     escrita dupla.
   - **Sem dados sensíveis:** nenhum id, valor, data, descrição ou
     household de produção vive no código; os UUIDs entram apenas como
     argumentos do operador. Relatórios carregam somente ids
     informados, o rótulo de transição `paid->open`, contagens e tags
     de motivo (`not_found` / `state_diverged`) — nunca valores.
3. **Implementação + CLI operacional, execução ainda separada.** Este
   ADR autoriza o código em controle de versão **e** o CLI funcional:
   sem pool injetado, o comando conecta via `DATABASE_URL` (fallback
   `DATABASE_URL_TEST`, mesma precedência do CLI de reconciliação) com
   pool próprio fechado em `finally`; dry-run conecta com
   `default_transaction_read_only=on` (só lê) e `--apply` continua o
   único gatilho de escrita. **Nenhuma DML/DDL foi executada** (nem
   contra produção, nem VPS, nem cópia): a execução em cópia de banco
   ou em produção permanece **etapa separada**, exigindo autorização, janela,
   backup prévio com tag de rollback (padrão do release-bridge) e os
   UUIDs completos obtidos da evidência controlada (`recon-v41.json`).
   A sequência operacional será: (a) dry-run na cópia, (b) apply na
   cópia, (c) reconciliação verde na cópia, (d) repetição em produção
   com backup — cada passo com aprovação explícita.

## Impacto e Rollback

- **Impacto:** após a execução (etapa futura separada), os 2 findings
  `status_mismatch` desaparecem da reconciliação; os statements voltam
  a aparecer como faturas em aberto, convergindo com o ledger (nenhum
  pagamento registrado). Nenhum outro check é afetado; ADR-017/019
  seguem intactos.
- **Rollback:** reversão lógica = `UPDATE statements SET status='paid'
  WHERE id IN (…)` **somente** se ambos ainda estiverem `open` com
  `paid_cents=0`, na mesma disciplina (dry-run primeiro, transação
  única, guarda espelhada), com autorização e backup próprios. Não há
  estado em produção para desfazer até que a etapa de execução ocorra.
- **Rollback deste ADR:** revogar por novo ADR; o código de reparo não
  cria estado por si só.

## Referências

- `docs/reports/v4.1-reconciliation-triage.md` §§1–2, §4.3 itens 2–3
  (evidência, não autorização).
- `docs/adr/ADR-017-pre-v033-historical-exception.md`,
  `ADR-018-negative-balance-bank-cash.md`,
  `ADR-019-test-fixture-reconciliation-exceptions.md` (grupos já
  fechados; este ADR não os altera).
- `apps/api/src/scripts/reconciliation/repair-statement-status-mismatch.ts`
  + testes (mecanismo; sem DML executada).
