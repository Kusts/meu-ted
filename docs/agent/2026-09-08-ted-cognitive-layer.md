# TED — camada cognitiva, Parte A (instruções + skills + wiring + web)

> Data: 2026-09-08 · Item 15 do produto ("agente não integrado") · Escopo:
> `apps/agent/**` + docs · Parte B (memória, compactação, aprendizado) fora
> do escopo, com ganchos deixados em `apps/agent/src/agent-config/index.ts`.

## Problema

A infraestrutura existia (52 tools geradas, approvals, ledger, failover),
mas o modelo nunca as recebia: `streamText` era chamado só com
`{model, system, prompt}` e o system prompt era um parágrafo genérico.
Resultado: respostas sem dados do workspace — o "não integrado" do relato.

## O que mudou

- `src/agent-config/instructions.ts` — persona versionada (`2026-09-08.a`):
  Meu Ted, regra de ouro (dados reais via tools, nunca inventar números),
  política de mutações via approval existente, limites (secrets, IDs).
- `src/agent-config/skills/` — 9 skills por situação (registros,
  saldo-extrato, categorias, orçamentos-metas, relatórios, contas-cartões,
  compromissos, workspace, web-search), cada uma com passos e armadilhas.
  Relatórios proíbe somar lançamento a lançamento havendo agregação.
- `src/agent-config/select-skill.ts` — heurística por palavra-chave +
  decisão por budget: injeta a vencedora inteira, ou todas se couber.
- `src/agent-config/playbook.ts` — 50/30/20 como referência, taxa de
  poupança, recorrentes/anômalos, fechamento vs vencimento, mês a mês — a
  partir dos KPIs existentes (`get_month_summary` e cia).
- `src/agent-config/tools.ts` — adaptador tools geradas → AI SDK `tool()`,
  subset curado (leituras sempre + skills relevantes, teto de 20), mapa
  tool→skill no prompt e **primeiro uso real** de `safety/tool-approvals.ts`
  (bloqueio em turno de consulta, confirmação explícita p/ approval tools,
  barreira de intenção p/ demais mutações).
- `src/finance-chat-agent.ts` — `onChatMessage` passa `tools` + `stopWhen`
  ao `streamText`; relay e broker passam a usar o system montado.
- `src/agent-config/web.ts` — `web_search`/`web_fetch` com provider por env
  (`TAVILY_API_KEY` > `BRAVE_API_KEY`, nenhuma key no código), mensagem
  elegante sem key e fetch com proteção SSRF (só http/https, sem hosts
  internos, redirects revalidados, timeout 10s, corpo truncado).
- `apps/agent/AGENTS.md` — resumo curto da persona e da arquitetura.

## Verificação

- 54 testes novos (`cognitive-*`): montagem do prompt, seleção/budget de
  skills, subset/gates de tools, capture do `streamText`, web
  habilitado/desabilitado/mockado e SSRF.
- Gates: `capabilities:check` verde (52/72, classes inalteradas);
  `write-policy:check` mantém apenas a deriva pré-existente
  (endpoints `mutationOptions` + wrapper `originPostHandler` não cobertos
  pela descoberta — fora desta task); `docs:lint` e typecheck do agent
  verdes. Typecheck global ainda tem 2 erros do WIP paralelo de notes
  (detalhe no `worker_done` da task).

## Para a Parte B

Preencher `CognitiveHooks.memoryContext` (resumo persistente por workspace)
e implementar `compactSession`/`learnFromTurn` — o prompt já reserva o slot
(`MEMÓRIA DO WORKSPACE`) sem ler nem escrever memória hoje.
