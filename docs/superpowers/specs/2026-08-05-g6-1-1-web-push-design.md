# G6.1.1 — Web Push com VAPID, consentimento e onboarding iOS instalado

## Objetivo

Entregar notificações Web Push reais no PWA. O usuário concede permissão por ação explícita; no iOS, a permissão só é oferecida depois que o PWA está instalado na Tela de Início.

## Arquitetura

- A API Fastify é a autoridade de Web Push e o único componente que conhece a chave privada VAPID.
- PostgreSQL armazena subscriptions por `workspace_id`, `user_id` e `endpoint`; o endpoint é único dentro do escopo do usuário/workspace.
- A API expõe uma chave pública VAPID, registra e remove subscriptions através de rotas autenticadas por Better Auth/workspace.
- O PWA usa a registration do `/sw.js`, solicita permissão somente no clique do usuário e envia a subscription pela camada API autenticada.
- O Service Worker trata `push` e `notificationclick`, sem incluir dados sensíveis no payload visual.

## Contrato de dados

`push_subscriptions` contém UUID, workspace, usuário, endpoint, `p256dh`, `auth`, user-agent, timestamps e `last_used_at`. Não armazena a chave privada VAPID. Registros são escopados no servidor; o cliente não escolhe `user_id` ou `workspace_id`.

## Consentimento e iOS

Estados explícitos: indisponível, instalação necessária, pronto, ativo, negado e erro. `Notification.requestPermission()` só ocorre após ativação de um botão. Safari iOS fora de `display-mode: standalone` mostra instruções de instalação; em standalone, mostra o botão de permissão. Permissão negada não é repetida automaticamente e orienta o usuário a reativar nas configurações.

## Segurança e operação

VAPID privado vem de env obrigatório no modo de envio; a chave pública pode ser servida pela API. Requests de registro usam idempotência; endpoint repetido atualiza metadados em vez de criar linha duplicada. A camada de envio deve remover subscriptions inválidas (404/410) e nunca logar endpoint completo, chaves ou payload sensível.

## Verificação

- API: migration, chave pública, authz por workspace/usuário, idempotência e remoção.
- PWA: permission flow, estados unsupported/denied, subscribe/unsubscribe e erro recuperável.
- Service Worker: registro de push, notificação padrão e clique.
- iOS: teste de standalone e instruções de onboarding.
- Typecheck, testes focados e `git diff --check`.
