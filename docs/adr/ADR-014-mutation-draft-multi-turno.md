# ADR-014 — MutationDraft multi-turno e handoff recuperável

**Status:** Aceito  
**Data:** 2026-09-14

## Contexto

A intenção incompleta do usuário precisa sobreviver entre turnos sem ganhar
autoridade financeira. Sem invariantes explícitos, um rascunho pode ser
confundido com operação pendente, executar efeitos ou gerar attestation.

## Decisão

O `MutationDraft` obedece invariantes fixos: NÃO é `PendingOperation`; não tem
autoridade financeira; não pode executar; não pode gerar attestation; é bound
a workspace+ator+dispositivo; tem TTL em minutos; é descartado após
proposta, cancelamento, expiração ou substituição.

O ciclo de vida inclui o estado `proposing`: `active → proposing → consumed |
discarded`; `active → discarded | expired | replaced`. O consumo é um
compare-and-set atômico no storage do Durable Object, e a
`proposalIdempotencyKey` estável é derivada do `draftId` e reutilizada em
todas as reemissões.

O handoff para `PendingOperation` é recuperável: 0 ou 1 operação pendente por
draft (invariantes INV-09/INV-10); `propose` idempotente com fingerprint do
payload; rejeição definitiva descarta o draft (`propose_rejected`); resultado
desconhecido retorna resposta inconclusiva — nunca sucesso nem cancelamento.

## Consequências

Intenções parciais persistem entre turnos sem risco de execução ou
attestation; reemissões e retries convergem para no máximo uma operação
pendente por draft. Falha fechada em resultado desconhecido impede afirmação
financeira sem evidência.
