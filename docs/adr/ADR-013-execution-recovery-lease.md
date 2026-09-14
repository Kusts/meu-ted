# ADR-013 — Protocolo de execução com lease e recuperação

**Status:** Aceito  
**Data:** 2026-09-14

## Contexto

Uma mutação confirmada não pode ficar eternamente em execução nem ser
reexecutada como nova aprovação após falha do executor. Sem lease, uma
recuperação ambígua pode duplicar efeitos financeiros ou ressuscitar estados
terminais.

## Decisão

A execução segue o protocolo em duas transações: TX1 (`claim`) consome a
attestation, marca `status=executing`, grava as colunas de lease e incrementa
a contagem de tentativas; o executor roda FORA da transação; TX2 registra
`succeeded`/`failed` com `failure_code` sanitizado e `mutation_id`.

O lease de execução tem expiração, e o reconciliador reexecuta o MESMO
executor com a MESMA `idempotencyKey` (recuperação, não nova aprovação). A
recuperação do estado `confirmed` ocorre EXCLUSIVAMENTE por reemissão de
attestation e NUNCA usa lease (as colunas de lease só são escritas no claim).
Estados terminais nunca retornam à execução.

A migration V052 é aditiva e backward-compatible: apenas adiciona as colunas
de lease, sem alterar colunas ou comportamento existentes.

## Consequências

Nenhuma operação permanece `executing` para sempre; recuperação é idempotente
por construção via mesma chave de idempotência. Falhas do executor geram
códigos sanitizados auditáveis, e o caminho `confirmed` permanece distinto do
caminho de lease sem possibilidade de confusão entre reemissão e recuperação.
