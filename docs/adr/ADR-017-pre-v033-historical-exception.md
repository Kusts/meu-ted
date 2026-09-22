# ADR-017 — Exceção histórica pré-V033 fechada (47 órfãs + 8 drifts)

**Status:** Aceito
**Data:** 2026-09-18

## Contexto

A triagem read-only pós-deploy V4.1 (`docs/reports/v4.1-reconciliation-triage.md`,
fonte `recon-v41.json` de 2026-09-17T19:09:26Z, `--schema=legacy`) registrou
63 findings, sem nenhum repair executado. Dois grupos têm causa-raiz histórica
comum, anterior ao vínculo transação-compra (pré-V033):

- **47 `orphan_card_purchase`** (`transaction_id` NULL, padrão uniforme em
  `detail.transaction_id = "null"`; triagem §2–§3): linhas de `card_purchases`
  criadas antes do vínculo transação-compra. O check `card_purchase` está
  limpo (0/47) por desenho (`detectors.ts:412-413` ignora linhas sem `txId`).
- **8 `statement_total` / `total_drift` com `linked_count=0`** (triagem §2–§4.1):
  statements sem nenhuma transação vinculada (`statement_id`), cujo total
  armazenado divergiu do ledger por falta de lock histórico (Fase 0).

A triagem propôs repairs condicionais (relink com candidata única, §4.4;
recomputação somente se `card_purchases` do statement também somarem 0, §4.1)
e fila humana para os 8 ambíguos restantes. O usuário aprovou política
diferente para estes dois grupos: **exceção histórica fechada, sem mutação**.

## Decisão

Os exatos 47 `orphan_card_purchase` pré-V033 e os exatos 8 `statement_total`
com `linked_count=0` existentes no `recon-v41.json` são uma **exceção histórica
fechada**:

1. **Nenhuma reconstrução de ledger e nenhum zeramento de totais.** Os
   §4.1–§4.2 e §5 (itens 2–3) da triagem ficam **não autorizados** para estes
   55 findings: não há relink, recomputação, `UPDATE` de `total_cents` ou
   preenchimento de FK sobre esse conjunto.
2. **Escopo exato e congelado.** A exceção cobre somente as 47 linhas órfãs e
   os 8 statements à data do JSON de 2026-09-17. Identidade por allowlist
   versionada (`adr-017-pre-v033-v1`) de fingerprints SHA-256, sem ids,
   valores, datas ou descrições em claro no código. O fingerprint do órfão
   congela a identidade completa (incluindo descrição da compra); o do
   statement congela id, household, total armazenado, soma/contagem
   vinculadas e soma/contagem de compras.
3. **Anomalias rotuladas pelo usuário como dados de teste estão fora desta
   decisão.** Este ADR não autoriza nem documenta nenhuma mutação sobre elas;
   destino próprio a definir.
4. O relatório de triagem permanece como registro histórico fiel do que foi
   observado e proposto — esta decisão o **substitui como autorização**, não
   o reescreve.

## Invariantes

- **Ledger autoritativo para escritas novas.** Toda escrita nova segue o
  invariante V4.1 (vínculo transação-compra, `recomputeTotal` via ledger,
  D1 sem saldo negativo para escritas novas).
- **Qualquer exceção nova ou alterada é erro/gate.** Novo órfão, novo drift,
  ou mudança nos 55 itens congelados (ex.: órfão ganhando `transaction_id`,
  total armazenado divergindo do valor congelado) deve reprovar
  reconciliação/gate, não entrar silenciosamente na exceção.
- **Cutover canônico segue bloqueado** até compatibilidade provada
  (paridade legacy×canonical + reconciliação verde no escopo não
  excepcionado), conforme `v4.1-canonical-readiness.md`
  (PRONTO PARA PLANEJAR, NÃO PARA EXECUTAR).

## Consequências

- Os 55 findings permanecem visíveis na reconciliação como exceção conhecida:
  matches exatos saem do conjunto de drift ativo e passam a `recognized`
  (`report.historicalExceptions`), com contabilidade `checked` preservada —
  não são saúde plena nem backlog de repair.
- Detectores e gates distinguem "exceção reconhecida" de "novo finding":
  runs globais e do household histórico aprovado exigem exatamente 47+8;
  household não relacionado espera zero. Linha nova, alterada (inclusive
  descrição) ou ausente reprova o gate (`historical_exception_count_mismatch`,
  `--fail-on-drift` sai 1), nunca entra silenciosamente na exceção.
- Rollout: implementação restrita a controle de versão (código de
  reconciliação + testes), sem DML/DDL, sem acesso a produção, sem deploy.
  Rollback: revogar este ADR por novo ADR; a exceção não cria estado em
  produção para desfazer.
- Os 8 findings estritamente ambíguos (saldo negativo, status/coverage de
  pagamento, payables com tx deletada; triagem §4.3) **não** fazem parte desta
  exceção e seguem exigindo decisão humana própria.

## Referências

- `docs/reports/v4.1-reconciliation-triage.md` §§1–4 (counts, causa-raiz,
  cross-checks, SQLs de verificação — evidência, não autorização).
- `docs/reports/v4.1-canonical-readiness.md`; `docs/ARCHITECTURE-CURRENT.md`
  (API como fonte da verdade).
