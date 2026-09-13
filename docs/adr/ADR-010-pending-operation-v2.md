# ADR-010 — Contrato de aprovação Pending Operation V2

**Status:** Aceito  
**Data:** 2026-09-13

## Contexto

A confirmação de uma mutação precisa aprovar exatamente a proposta criada para
o mesmo workspace, ator e dispositivo. O Agent pode sugerir uma operação, mas
não pode fabricar aprovação, identidade, capability ou idempotência.

## Decisão

`PendingOperationV2` é um DTO isomórfico em `@pi-finance/llm-contracts` e possui
campos estritos `version`, `workspaceId`, `actorId`, `deviceId`, `tool`,
`normalizedArgs`, `proposalHash`, `idempotencyKey`, `createdAt`, `expiresAt` e
`bindings`. `deviceId` é obrigatório e não nulo; `bindings` repete os três
identificadores e o schema rejeita qualquer divergência, campos desconhecidos,
TTL não positivo e hash que não seja SHA-256 hexadecimal.

O hash é calculado sobre uma serialização JSON canônica de somente `tool`,
`normalizedArgs`, `workspaceId`, `actorId` e `deviceId`. Portanto summary/status,
timestamps e idempotency key não alteram a proposta aprovada; qualquer mudança
de ferramenta, argumentos ou identidade exige novo hash e nova confirmação.

O package contém apenas tipos, Zod e Web Crypto, sem imports de servidor. Este
ADR não cria endpoint, store, migration, executor ou attestation; essas
responsabilidades pertencem às fases posteriores e à API autoritativa.

## Consequências

API e Agent compartilham o mesmo boundary verificável, com falha fechada para
payload incompleto ou binding divergente. A verificação criptográfica é
assíncrona (`crypto.subtle`) e deve ocorrer antes de qualquer execução; replay,
TTL, auditoria e emissão de attestation continuam fora deste contrato.
