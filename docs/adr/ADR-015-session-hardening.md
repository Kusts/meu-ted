# ADR-015 — Hardening de sessão e convergência session-first do device token

**Status:** Aceito  
**Data:** 2026-09-16

## Contexto

A sessão normal da PWA ainda depende de dois bearers reutilizáveis em
localStorage (`pi-finance:session-token`, `pi-finance:token`), lidos em
`apps/pwa/src/lib/api/client.ts:73-91` e anexados a toda chamada em
`client.ts:141-154`. Qualquer XSS com acesso a JS exfiltra credenciais
capazes de autenticar sessão normal. A API, porém, já emite cookie de sessão
HttpOnly via Better-Auth (`apps/api/src/auth/better-auth.ts:50-58`,
atributos `httpOnly`/`sameSite`/`secure`) e o faz atravessar o proxy
(`apps/api/src/auth/better-auth-http.ts:125-130`, repasse de `set-cookie`).
A resolução central de autenticação já prefere sessão + `X-Workspace-Id`
antes do fallback de device token (`apps/api/src/routes/index.ts:210-261`).

## Decisão

Adota-se a **Opção C: convergência session-first**.

Sessão normal opera cookie-first a partir do cookie Better-Auth já emitido
hoje; a PWA para de PRECISAR do bearer do localStorage. A escrita das chaves
legadas fica atrás de flag de compatibilidade com data de remoção (janela
ADR-011/T5.4, review 2026-12-01). A telemetria de uso efetivo
`auth.request.legacy_bearer_used` é emitida somente quando o bearer
autentica a request na ausência de cookie válido — header presente ou login
não contam como uso.

O device token permanece apenas para usos escopados (registro, verificação,
context-token). Chamadas normais dispensam `X-Device-Token`, pois a
resolução central já autentica por sessão + `X-Workspace-Id`
(`routes/index.ts:219-237`) antes do fallback. A migration V053 torna o
token aleatório sem household no segredo, com `token_hash` SHA-256 em
repouso (precedente dos invites, `apps/api/src/auth/invites-postgres.ts:65`),
lifecycle `name`/`user_id`/`last_used_at`/`expires_at`/`revoked_at`, rotação
com janela e revogação do anterior (nunca dois eternos), e queries sem a
tautologia `household_id = household_id` nos 4 pontos
(`device-token.ts:57,71`; `payables/postgres.ts:580,595`).

A identidade offline é o `offlineSubjectId`: id do workspace/household ativo
(UUID estável, opaco, não autenticador, não derivado de credencial, D-V4-11).
O snapshot particiona por `offlineSubjectId`, nunca por credencial
(`ownerFingerprint` pode permanecer como defesa adicional, nunca chave
primária). A política offline exige `lastOnlineAuthenticatedAt` persistido e
`MAX_OFFLINE_AUTH_AGE` configurável, com tolerância de relógio registrada;
idade excedida trava a sessão offline (`offline session locked` com
revalidação online); escritas offline permanecem proibidas.

A janela de coexistência do bearer fecha por limiar de remoção baseado na
telemetria de USO EFETIVO, com prazo de referência em 2026-12-01 e gatilhos
de remoção por bloco (leitura, escrita, fallback server-side).

Opção A (cookie dedicado com injeção proxy→header) rejeitada: cria nova
credencial de ambiente cuja fronteira proxy→API é difícil de tornar
não-forjável. Opção B (header temporário) rejeitada: mantém segredo
reutilizável em JS durante a migração.

## Consequências

Rollout em slices reversíveis (proxy same-origin → cookie-first com
coexistência → remoção gradual → V053 → rotação), com o bearer legado como
fallback de rollback durante a janela. Critérios de aceite: XLT-02 (login e
operação sem bearer novo em localStorage), XLT-08/XLT-09 (lock por idade e
limpeza no logout) e XLT-10 (vazamento do banco não autentica).
