# G6.1.4 — Métricas de adoção e funil de notificações

## Objetivo

Medir a adoção do canal de notificações e da captura rápida sem armazenar conteúdo de notificações, mensagens ou transações. O resultado é uma API workspace-scoped e um dashboard operacional acessível.

## Eventos

A API aceita somente estes eventos:

- `notification_delivered`
- `notification_opened`
- `chat_used`
- `capture_started`
- `capture_completed`

Cada evento contém `workspace_id`, `event_type`, `occurred_at`, `flow_id` opcional e metadados agregados mínimos. `flow_id` correlaciona início e conclusão de uma captura e nunca contém conteúdo do usuário.

## Privacidade

Não persistir corpo de notificação, texto de chat, descrição de transação, valores, categorias, endpoints push ou tokens. O endpoint exige autenticação e deriva o workspace do contexto autenticado; um workspace enviado pelo cliente não pode ampliar escopo.

## API

- `POST /observability/adoption-events`: valida evento, autentica request, grava evento e retorna `201`.
- `GET /observability/adoption-funnel?from=YYYY-MM-DD&to=YYYY-MM-DD`: autentica request e retorna contagens de entrega, abertura, uso do chat, captura iniciada/concluída, conversões e mediana/p95 do tempo entre início e conclusão.

Datas têm janela inclusiva e limite máximo definido pelo servidor. Eventos fora do workspace autenticado retornam erro de autorização.

## Instrumentação PWA

- Entrega: evento produzido pelo fluxo de confirmação de entrega disponível no cliente/worker.
- Abertura: evento no clique de notificação ou entrada equivalente.
- Chat: evento no envio bem-sucedido de mensagem.
- Captura: `capture_started` ao abrir `/capture` e `capture_completed` após salvamento bem-sucedido, usando o mesmo `flow_id`.

Falha de telemetria nunca bloqueia a ação primária do usuário.

## Dashboard

Adicionar uma página operacional acessível a partir de Reports/Profile, com cards para período, contagens, conversões e tempo mediano/p95. O funil será renderizado com elementos semânticos e texto, sem nova dependência de gráficos.

## Verificação

- Testes de schema, autenticação, isolamento por workspace, privacidade e agregação.
- Testes PWA dos pontos de instrumentação e dashboard.
- Typecheck, lint/format e integração com PostgreSQL.
