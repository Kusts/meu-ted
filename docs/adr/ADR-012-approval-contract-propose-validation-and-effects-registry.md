# ADR-012 — Contrato de ferramentas de aprovação e Effects Registry

**Status:** Aceito  
**Data:** 2026-09-14

## Contexto

A proposta de mutação precisa validar exatamente as ferramentas aprovadas para
o mesmo workspace, ator e dispositivo. Sem um contrato único, a validação se
espalha entre Agent e API, e alvos de reconciliação da PWA podem vazar para
dentro da decisão de aprovação, ampliando a superfície de autoridade
financeira.

## Decisão

O Approval Tool Contract é a fonte única `{ tool, inputSchema,
approvalRequired, executor }` para `transactions.expense.create` e
`transactions.income.create`. A validação canônica ocorre no endpoint de
proposta (`propose`); nenhuma outra camada revalida ou estende o contrato.

O Mutation Effects Registry é estritamente separado do contrato de aprovação:
os alvos de reconciliação da PWA vivem fora do contrato e nunca participam da
decisão de aprovar, executar ou atestar.

A identidade do `MutationReceipt` segue semântica fixa: `mutationId` é
universal, gerado pela API uma única vez por mutação bem-sucedida e persistido
em `mutation_id` no caminho TED (TX2). `operationId` existe somente quando a
origem é uma `PendingOperation` (TED); escritas normais recebem recibos sem
`operationId`.

## Consequências

Proposta, aprovação e execução compartilham o mesmo boundary verificável, com
falha fechada para ferramenta fora do contrato ou binding divergente. O
registry pode evoluir os alvos de reconciliação sem tocar na autoridade de
aprovação; recibos distinguem origem TED de escritas normais sem ambiguidade.
