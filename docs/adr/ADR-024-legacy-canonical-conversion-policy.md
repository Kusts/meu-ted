# ADR-024 — Política de conversão Legacy para Canonical

**Status:** Aceito
**Data:** 2026-09-19

## Contexto

O cutover Canonical exige converter o banco legado, não apenas trocar
`DB_SCHEMA`: as migrations canônicas usam `CREATE TABLE IF NOT EXISTS` e não
transformam as formas legadas já existentes. A conversão deve ser idempotente,
ensaiada em clone restaurável e falhar fechada quando não houver mapeamento
determinístico.

## Decisão

1. Contas legadas sem distinção entre banco e dinheiro migram para `kind=bank`.
   O relatório de conversão registra cada uma; nenhuma conta `cash` é inferida.
2. Duplicatas que violariam constraints canônicas bloqueiam a conversão e são
   relatadas. Não há dedupe, repoint ou deleção automática.
3. Households, memberships, invites órfãos e usuários sem email bloqueiam a
   conversão. A materialização de um household que já é referenciado por dados
   financeiros legados preserva essa identidade lógica e é permitida; o processo
   não cria owner, membership ou identidade sintética nem descarta dados para
   prosseguir.
4. V056 não faz backfill de `statement_payment_id` por descrição livre.
   Pagamentos históricos sem vínculo estruturado permanecem sem link e não
   contam na cobertura canônica; eventual reparo exige evidência determinística
   em operação separada.
5. V055 deve ser comprovada fisicamente no clone: o check global
   `accounts_balance_cents_check` não pode permanecer e o check
   `accounts_balance_nonnegative_card_chk` deve existir antes do boot
   Canonical.

## Consequências

- O primeiro artefato executável é um preflight somente leitura que classifica
  blockers por entidade antes de DDL/DML.
- A migração idempotente só roda se o preflight estiver limpo, backup/restauração
  forem verificados e o clone passar migrations, boot canônico, reconciliação,
  paridade e smoke.
- Falha em qualquer gate é NO-GO; rollback de produção é retornar para
  `DB_SCHEMA=legacy` e, se houver alteração irreversível, restaurar backup
  validado. ADR-020 não faz parte dessa conversão.

## Referências

- `docs/adr/ADR-018-negative-balance-bank-cash.md`.
- `apps/api/src/read-models/sql/V055__negative_bank_cash_balances.sql`.
- `apps/api/src/read-models/sql/V056__statement_payment_link.sql`.
- `docs/reports/v4.1-canonical-readiness.md`.
