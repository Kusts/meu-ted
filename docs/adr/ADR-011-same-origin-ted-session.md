# ADR-011 — Transporte same-origin da sessão e do TED

## Status

Aceito para a consolidação TED V2.

## Contexto

O browser não deve chamar diretamente a API VPS nem o Worker do Agent. Isso
expõe fronteiras CORS e incentiva o armazenamento de credenciais sensíveis no
browser. O fluxo canônico é `browser → /api/backend` e `browser → /api/agent`.

## Decisão

Os proxies Next.js encaminham somente headers explicitamente permitidos,
rejeitam origens estrangeiras em métodos mutáveis, limitam o corpo recebido e
aplicam timeout no upstream. Respostas de API e Agent recebem `no-store` para
impedir cache de sessão, ferramentas, operações pendentes ou dados financeiros;
`Set-Cookie` é preservado para que a sessão HttpOnly seja estabelecida pela
origem da PWA.

O cliente mantém compatibilidade transitória com URLs configuradas para
ambientes de teste, mas o fallback de produção é same-origin. Nenhum token de
sessão, device ou bearer é criado pelo fluxo de aprovação TED V2, e a UI só
exibe “registrada” quando a API retorna `succeeded`.

## Consequências

CSRF é reduzido pela validação de `Origin` no proxy; a API continua responsável
por autenticação, autorização, workspace/actor/device binding e idempotência.
O Service Worker deve tratar esses caminhos como privados e nunca armazenar
respostas ou credenciais.
