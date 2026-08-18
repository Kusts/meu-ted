# Context Token Bridge → Pi/API

## Purpose

Transportar contexto de canal sem confiar em `chatId` para escolher workspace e sem usar estado global por request.

## Claims v1

```ts
{
  iss: "pi-bridge-context",
  aud: "pi-finance-api",
  v: 1,
  sub: channelActorId,
  workspace: workspaceId,
  chatId: remoteJid,
  providerMessageId,
  requestId,
  jti,
  iat,
  exp
}
```
- `sub` é o `channelActorId` (senderPhone/JID normalizado) validado pelo bridge; não é o `deviceId` do API.
- `workspace`, `chatId`, `providerMessageId` e `requestId` são obrigatórios e strings não vazias.
- `iat` e `exp` são segundos Unix; TTL máximo é 5 minutos.
- `jti` é UUID único por emissão e identifica um turn do bridge.
- A assinatura é HMAC-SHA-256 usando `PI_CONTEXT_TOKEN_SECRET`; ausência do secret falha fechado em produção.
- O header de transporte é `x-pi-context-token`.
- O workspace do claim deve ser igual ao `householdId` resolvido pelo device token; não existe hoje uma relação server-owned entre channelActorId e deviceId, então eles não são comparados diretamente.
## Emissão e transporte

1. O bridge resolve `channelActorId` e workspace através do registro server-owned antes de construir o contexto.
2. O bridge emite um token por mensagem/turn.
3. O mesmo token pode acompanhar múltiplas chamadas de tools dentro desse turn; o API client envia o header em cada chamada.
4. Nenhum token é salvo em variável global, `.env`, log ou payload financeiro persistido.

## Validação

O API valida assinatura, `iss`, `aud`, versão, `iat/exp`, formato UUID de `jti` quando aplicável e binding `requestId/providerMessageId`. O workspace usado em qualquer lookup vem do claim validado e precisa coincidir com a autenticação device; `householdId`/workspace fornecido pelo tool não pode sobrescrever o claim.

Tokens inválidos, expirados, com assinatura errada, audience errada, request binding divergente ou workspace divergente retornam erro de autenticação/contexto e não executam side effect.

## Replay e múltiplas tools por turn

`jti` identifica um turn, não uma chamada individual. O API registra o primeiro `jti` com seu workspace/request/provider binding e aceita chamadas subsequentes do mesmo turn até `exp` somente se a assinatura, os bindings e o workspace autenticado continuarem válidos. Writes continuam exigindo idempotency key.

Esta semântica não declara proteção contra replay de uma requisição individual roubada durante o TTL. Proteção forte por chamada exige um exchange/per-call nonce futuro; não usar `jti` único por chamada enquanto o mesmo token for reutilizado por múltiplas tools.

## Compatibilidade

Chamadas sem token continuam válidas para PWA/API autenticados que não usam o bridge, mas não podem usar a compatibilidade `chatId` para escolher workspace. O token é contexto adicional, não substituto do device/delegated auth.
