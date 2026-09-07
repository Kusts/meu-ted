# TED — memória persistente, Parte B (sessões, compactação, aprendizado)

> Data: 2026-09-09 · Item 15 (continuação da Parte A em
> `2026-09-08-ted-cognitive-layer.md`) · Escopo: `apps/agent/**`,
> `apps/pwa/src/features/ted/**` + `lib/api/agent-client.ts`.

## O que mudou

- `agent-config/memory/store.ts` — `agent_memory` (fact|preference|learning|
  summary, salience, expiração), `agent_prefs` (opt-out por workspace, ON por
  default), contadores de turno; `remember_fact` com consentimento implícito
  do pedido + dedup por similaridade; `recall` por keywords/recência/
  salience com budget fixo; injeção `MEMÓRIA DO USUÁRIO` via
  `CognitiveHooks.memoryContext`.
- `agent-config/memory/compact.ts` — acima de 40 mensagens, as antigas viram
  1 resumo (modelo ativo, fallback extrativo silencioso) e saem do contexto
  enviado ao modelo; storage preservado.
- `agent-config/memory/sessions.ts` + `POST /rpc/session/new` — registro de
  sessões (isolado por workspace+actor), `list_past_sessions` e
  `get_session_summary` como tools; renovação arquiva resumo e limpa o
  contexto sem tocar nas memórias.
- `agent-config/memory/learn.ts` — pós-turno leve (heurística sempre, LLM
  barato a cada 5 turnos), 0–2 aprendizados, dedup, decaimento por recência,
  opt-out respeitado, redaction + filtro anti-cartão; `memorized[]` volta na
  resposta do relay para o toast do PWA.
- `POST /rpc/memory/prefs` — toggle de privacidade por workspace.
- PWA (`features/ted`): botão "Nova sessão", toast "TED memorizou: …",
  `renewAgentSession()`; histórico continua carregando do DO ao reabrir.

## Verificação

- 28 testes novos de memória + 4 de sessão no PWA; suites do agente (45 arq.)
  e do chat verdes; `capabilities:check`, `docs:lint` e typechecks verdes.
- Suite completa do PWA no pool apresenta flakiness pré-existente entre
  arquivos (vítimas variam a cada run; tudo verde isolado/escopado).
