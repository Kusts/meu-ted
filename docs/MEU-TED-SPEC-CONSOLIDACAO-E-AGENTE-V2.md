# SPEC — Consolidação arquitetural e TED Agent V2

**Projeto:** Meu TED  
**Status:** Proposta pronta para implementação  
**Baseline auditada:** `Kusts/meu-ted`, `main@6bf7cfe69ba1a36cd7bbcfc1219e7c2bd388a315`  
**Data da baseline:** 12/09/2026  
**Prioridade geral:** P0/P1  
**Idioma da documentação:** pt-BR  
**Idioma do código:** inglês técnico

> Esta SPEC autoriza refatorações internas amplas quando forem necessárias para cumprir os requisitos, desde que os contratos públicos, os dados existentes, o isolamento por workspace e a compatibilidade de produção sejam preservados. Não autoriza apagar dados, reescrever migrations já aplicadas, executar deploy em produção ou alterar segredos sem aprovação explícita.

---

## 1. Instrução de execução para o agente

Implemente esta SPEC de forma autônoma, seguindo o `AGENTS.md` do repositório e TDD rigoroso (`RED → GREEN → REFACTOR`). Antes de editar, confirme a baseline real, leia os documentos canônicos em `docs/` e registre qualquer divergência causada por commits posteriores a `6bf7cfe`.

Regras de execução:

1. Preserve a arquitetura fundamental: PWA e TED são clientes; a API é a única autoridade financeira; PostgreSQL é a fonte da verdade.
2. Não crie novos microserviços. A modularização do TED deve ocorrer dentro de `apps/agent`.
3. Não faça mutações diretamente no banco a partir da PWA ou do Agent.
4. Não desative regras de lint, testes, auditorias ou segurança para obter um gate verde.
5. Não mantenha caminhos paralelos incompatíveis. Todo canal de conversa deve usar o mesmo pipeline interno.
6. Mudanças financeiras devem manter idempotência, auditoria, workspace, actor, device e capabilities.
7. Faça alterações em fases pequenas e verificáveis. Se uma fase falhar, corrija-a antes de avançar.
8. Não interrompa o trabalho para decisões reversíveis de implementação. Escale apenas bloqueios reais: segredo ausente, acesso externo, operação destrutiva, deploy ou decisão de produto incompatível com esta SPEC.
9. Não execute deploy em produção. Entregue código, migrations novas quando indispensáveis, workflows, testes, runbooks e evidências para revisão.
10. Ao concluir, gere `docs/reports/agent-v2-implementation-report.md` com: baseline, arquivos alterados, decisões, testes executados, resultados, métricas antes/depois, riscos residuais e passos de implantação/rollback.

---

## 2. Contexto de produção

Topologia que deve ser preservada:

```mermaid
flowchart TD
    U["Usuário"] --> P["PWA · Cloudflare"]
    P --> A["TED Agent · Cloudflare Worker/DO"]
    P --> B["API · VPS"]
    A --> B
    B --> D["PostgreSQL · VPS"]
```

- `apps/pwa`: Next.js/OpenNext, hospedada na Cloudflare.
- `apps/agent`: Cloudflare Worker + Durable Objects, hospedado na Cloudflare.
- `apps/api`: Fastify/Node.js, executado na VPS.
- PostgreSQL 16: executado na VPS e acessível apenas pela API.
- `apps/codex-broker`: integração privada/experimental com provedores Codex; não deve ser autoridade financeira.

### 2.1 Arquitetura que não deve mudar

```text
PWA ───────────────► API ─────────► PostgreSQL
 │                    ▲
 └────► TED Agent ────┘
```

A API continua responsável por autenticação, autorização, validação financeira, idempotência, auditoria e persistência. O Agent interpreta a solicitação, busca dados por capabilities, prepara propostas, solicita confirmação e chama a API.

---

## 3. Diagnóstico confirmado

### 3.1 Causa principal da baixa confiabilidade do TED

O Agent possui dois fluxos cognitivos diferentes:

1. O caminho direto usa `streamText`, tools nativas e `buildExposedTools()`.
2. O endpoint `/rpc/chat`, usado pelo produto, executa pré-buscas por regex, serializa resultados no prompt, usa um relay sem tool loop e interpreta texto `[EXEC_ACTION: {...}]` como comando.

Esses caminhos têm regras, contexto, memória, execução e respostas diferentes. O comportamento depende do canal/provedor, e não apenas da intenção do usuário.

### 3.2 Problemas concretos do Agent

- `[EXEC_ACTION]` permite que texto produzido pelo modelo origine uma mutação e que o executor fabrique `mutationApproved: true`.
- O prompt manda o modelo afirmar que registrou a operação antes de a API confirmar sucesso.
- A regex que extrai JSON não é um protocolo estruturado confiável.
- O Agent pode escolher silenciosamente a primeira categoria disponível quando não há categoria informada.
- O pré-carregamento consulta no máximo duas ferramentas, mesmo quando a resposta precisa de mais evidências.
- Quando nenhuma intenção é encontrada, o código consulta contas mesmo para perguntas que não precisam disso.
- Resultados de tools são convertidos em JSON, truncados por caracteres e anexados ao prompt sem contrato tipado.
- Falhas de enriquecimento são `fail-open`; o modelo pode continuar sem os dados necessários.
- O seletor de skills usa fragmentos de palavras e pode injetar todas as skills se couberem em um orçamento de caracteres.
- Até 20 tools podem ser expostas, aumentando confusão e escolhas erradas.
- A autorização de mutação usa regex de intenção/confirmacão em vez de uma operação pendente vinculada ao usuário.
- `tool-policy.ts` e `shadow-runner.ts` são stubs e não oferecem a proteção/observabilidade sugeridas por seus nomes.
- `finance-chat-agent.ts` concentra autenticação de turno, histórico, memória, roteamento, inferência, prefetch, execução, persistência e métricas.
- O caminho direto usa o namespace artificial `direct` para workspace/memória; o caminho REST usa o workspace verificado.
- O aprendizado pode ocorrer sem a resposta final do assistente e sem distinção clara entre fato durável e dado financeiro transitório.

### 3.3 Problemas do restante do projeto

- Testes do Agent não bloqueiam o CI principal.
- O job do WhatsApp Bridge fica verde mesmo sem o package correspondente.
- O CI principal usa Node 20, enquanto partes do monorepo exigem Node 22.
- O Docker da API não inclui corretamente o package compartilhado `packages/llm-contracts`.
- O Codex Broker faz `tsc --noEmit` e tenta iniciar `src/server.js`, que não é produzido.
- A política declara migrations separadas, mas o processo web chama `runMigrations()` no startup.
- O `startup-guard` existe, mas não está conectado ao bootstrap efetivo.
- Segredos e identidades administrativas possuem defaults de desenvolvimento que não podem existir em produção.
- PWA lint e security audit estão vermelhos na baseline.
- O deploy da PWA pode ocorrer em `main` mesmo com o CI principal vermelho.
- O smoke de produção é apenas manual.
- Há drift entre README, packages, CI e a arquitetura atual.

---

## 4. Objetivos

### 4.1 Objetivos obrigatórios

1. Eliminar qualquer caminho em que texto livre do LLM autorize ou execute uma mutação.
2. Unificar todos os canais/provedores em um único pipeline de turno.
3. Fazer respostas financeiras usarem somente evidências atuais vindas da API.
4. Fazer o TED pedir apenas as informações que realmente faltam.
5. Tornar confirmação, execução e retry determinísticos e idempotentes.
6. Reduzir tools e contexto por turno sem perder capacidades.
7. Fazer o TED nunca dizer “feito”, “registrado” ou equivalente antes do sucesso confirmado pela API.
8. Transformar o Agent em required gate do CI.
9. Corrigir os problemas de build, configuração, migrations e deploy encontrados na auditoria.
10. Criar uma suíte de avaliação reproduzível para medir regressões cognitivas.

### 4.2 Metas mensuráveis

| Métrica | Meta de aceite |
|---|---:|
| Valores financeiros inventados no conjunto de avaliação | 0 |
| Mutações sem operação confirmada válida | 0 |
| Mutações duplicadas em retry/replay | 0 |
| Troca de workspace/actor/device em confirmação | 0 aceita |
| Respostas de sucesso sem confirmação da API | 0 |
| Seleção correta de domínio no conjunto de avaliação | ≥ 95% |
| Seleção correta de ação/tool quando aplicável | ≥ 95% |
| Cenários críticos de saldo, extrato e lançamento | 100% |
| Tools expostas/permitidas por turno | máximo 8 |
| Chamadas LLM em consulta simples comum | máximo 1 |
| Chamadas API em saldo simples | máximo 2 |
| CI principal | 100% verde |

As metas de acurácia devem ser calculadas em fixtures determinísticas e sem dados reais de produção.

---

## 5. Não objetivos

- Não migrar para microserviços.
- Não mover PostgreSQL para a Cloudflare.
- Não transformar o Agent em fonte da verdade financeira.
- Não adicionar RAG ou banco vetorial apenas para tentar corrigir alucinação.
- Não trocar o framework principal sem uma necessidade comprovada.
- Não redesenhar toda a interface da PWA.
- Não executar deploy ou migrations em produção durante a implementação.
- Não remover capabilities, delegated tokens, anti-replay, DLP ou auditoria existentes.
- Não manter compatibilidade com caminhos comprovadamente removidos, como o antigo WhatsApp Bridge, salvo por migration explícita e temporária.

---

## 6. Invariantes obrigatórias

Estas regras devem ser verdadeiras por código e testes, não apenas por prompt:

1. **API authority:** toda leitura/escrita financeira passa pela API.
2. **Workspace isolation:** nenhuma query, tool, memória, aprovação ou log cruza workspaces.
3. **Actor/device binding:** confirmação só vale para o mesmo actor, workspace e device que receberam a proposta.
4. **Single mutation issuer:** apenas `MutationExecutor` pode obter uma atestação de mutação e chamar uma tool de escrita.
5. **LLM is advisory:** o modelo pode propor plano e argumentos; nunca pode conceder capability, aprovação ou atestação.
6. **Pending operation authority:** a operação pendente autoritativa fica na API; o Durable Object guarda, no máximo, o identificador opaco para continuidade da conversa.
7. **Exact confirmation:** a confirmação aprova um hash imutável de `tool + normalizedArgs + workspace + actor + device`.
8. **Fresh data:** saldo, fatura, orçamento, meta, transação e projeção vêm de leitura atual ou de snapshot explicitamente datado.
9. **No premature success:** uma resposta de sucesso só é construída depois da API retornar sucesso.
10. **Idempotency:** toda mutação usa `Idempotency-Key` estável derivada da operação pendente, não do texto do modelo.
11. **Fail closed:** sem evidência, schema válido, capability, confirmação ou binding, a ação não ocorre.
12. **No raw secrets/IDs:** prompts, respostas e logs não expõem segredos nem IDs técnicos ao usuário.
13. **No arbitrary defaults:** conta, cartão, categoria, data ou valor nunca são escolhidos silenciosamente se houver ambiguidade material.
14. **One pipeline:** REST, AI SDK, Codex Broker e fallback convergem para o mesmo `ConversationOrchestrator`.

---

## 7. Arquitetura-alvo do TED Agent V2

```mermaid
flowchart TD
    R["Request autenticada"] --> I["TurnInput normalizado"]
    I --> O["ConversationOrchestrator"]
    O --> T["Intent Router"]
    T --> P["Validated TurnPlan"]
    P --> E["Evidence Collector"]
    P --> M["Mutation Policy"]
    E --> G["Grounded Responder"]
    M --> Q["Pending Operation"]
    Q --> X["Mutation Executor"]
    X --> G
    G --> S["Persistência + métricas"]
```

### 7.1 Módulos internos esperados

Nomes podem variar, mas as responsabilidades devem ficar separadas:

```text
apps/agent/src/orchestration/
  conversation-orchestrator.ts
  turn-input.ts
  turn-plan.ts
  intent-router.ts
  provider-adapter.ts

apps/agent/src/evidence/
  evidence-collector.ts
  evidence-envelope.ts
  financial-formatters.ts
  grounding-validator.ts

apps/agent/src/mutations/
  mutation-policy.ts
  pending-operation.ts
  confirmation-resolver.ts
  mutation-executor.ts

apps/agent/src/responses/
  deterministic-responses.ts
  grounded-response.ts

apps/agent/src/observability/
  turn-events.ts
  metrics.ts
  redaction.ts
```

Não é obrigatório reproduzir exatamente essa árvore. É obrigatório impedir que `finance-chat-agent.ts` continue concentrando todo o comportamento.

### 7.2 Contrato de entrada do turno

Todo canal deve produzir o mesmo objeto imutável:

```ts
type TurnInput = Readonly<{
  intentionId: string;
  traceId: string;
  text: string;
  actorId: string;
  workspaceId: string;
  role: "owner" | "member";
  deviceId: string | null;
  attachments: SafeAttachmentMetadata[];
  channel: "pwa-rest" | "sdk" | "broker";
}>;
```

- Identidade vem apenas de headers/tokens já verificados.
- Campos de identidade presentes no body devem ser ignorados.
- O texto persistido deve passar pelo DLP existente.
- `intentionId` deve ter limite, formato e tratamento anti-replay.
- O canal não altera políticas ou capabilities.

### 7.3 Contrato de plano

O roteador pode usar regras determinísticas para casos frequentes e saída estruturada do LLM para casos ambíguos. Toda saída deve passar por Zod/JSON Schema.

```ts
type TurnPlan = {
  version: "2";
  mode: "read" | "mutation-proposal" | "confirmation" | "cancel" | "advice" | "conversation" | "unsupported";
  domain: "accounts" | "transactions" | "cards" | "payables" | "budgets" | "goals" | "categories" | "memory" | "web" | "general";
  skillNames: string[];       // máximo 2
  requestedOperations: PlannedOperation[]; // máximo 4
  missingFields: string[];
  ambiguity: string | null;
  confidence: number;
};
```

Regras:

- O plano é uma sugestão não confiável até ser validado.
- Tool precisa existir no inventário canônico, pertencer ao domínio/skill permitido e ser compatível com `mode`.
- O modelo não envia `mutationApproved`, capabilities, workspace, actor, device ou idempotency key.
- Plano inválido deve ser rejeitado; nunca executado parcialmente.
- No máximo uma correção/retry estruturada do planner. Persistindo a invalidade, usar resposta segura e observável.

### 7.4 Fast paths determinísticos

Casos frequentes devem evitar planejamento generativo desnecessário:

- “Qual meu saldo?” → `list_accounts`/`get_balance` + renderer determinístico.
- “Mostre os últimos lançamentos” → `list_recent_transactions` + renderer.
- Confirmação/cancelamento → resolver operação pendente na API sem reconstruir argumentos com LLM.
- “Gastei R$ X em Y” → parser financeiro + resolução de conta/categoria; criar proposta, nunca executar diretamente.

Se o parser tiver baixa confiança ou múltiplas contas/categorias candidatas, pedir uma pergunta curta de desambiguação.

### 7.5 Adaptadores de provider

- Provider/model selection, fallback e rollout continuam configuráveis.
- Nenhum provider deve receber autoridade adicional por oferecer tool calling nativo.
- Providers com tool calling e providers text-only devem convergir para os mesmos contratos `TurnPlan` e `GroundedResponse`.
- Codex Broker não executa mutações; ele apenas retorna output estruturado validável.
- Erros de schema não contam como sucesso do provider.
- Fallback só ocorre para falhas classificadas como retryable ou output estrutural inválido conforme política documentada.

---

## 8. Requisitos funcionais do Agent

### AGENT-001 — Remover o protocolo `[EXEC_ACTION]` (P0)

Remover do prompt, parser e executor qualquer suporte a `[EXEC_ACTION: ...]`.

Critérios de aceite:

- Busca no repositório não encontra protocolo ativo `[EXEC_ACTION]`.
- Texto do modelo contendo o marcador é tratado como texto não confiável e não executa nada.
- Nenhum código fora de `MutationExecutor` consegue fornecer a atestação aceita por tools mutáveis.
- Teste de arquitetura falha se outro módulo chamar executor gerado com `mutationApproved`.

### AGENT-002 — Unificar os caminhos de conversa (P0)

Extrair `runTurn(input: TurnInput)` e fazer `/rpc/chat`, handler AI SDK e Broker chamarem esse mesmo orquestrador.

Critérios de aceite:

- Mesmo fixture + mesmo modelo + mesmo workspace produz o mesmo plano e a mesma política em todos os canais.
- Não há prefetch duplicado específico de `/rpc/chat`.
- Não existe namespace `direct` em caminhos de produção.
- Rotas experimentais sem identidade verificável ficam desabilitadas em produção.

### AGENT-003 — Roteamento confiável e mínimo (P0)

Substituir o simples `haystack.includes(keyword)` por roteamento em camadas:

1. normalização pt-BR;
2. regras determinísticas de alta precisão;
3. classificador estruturado somente quando necessário;
4. validação do plano;
5. fallback seguro para pergunta de clarificação.

Critérios de aceite:

- Uma skill primária e, no máximo, uma secundária.
- Nunca injetar todas as skills apenas porque cabem no limite.
- No máximo 8 tools permitidas por turno.
- Nenhuma tool mutável em turno `read`, `advice` ou `conversation`.
- Testes cobrem linguagem natural, erros de digitação, negação e frases compostas em pt-BR.

### AGENT-004 — Coleta de evidências tipada (P0)

Substituir snippets de `JSON.stringify(...).slice(...)` por `EvidenceEnvelope` tipado.

```ts
type EvidenceItem = {
  ref: string;
  source: string;
  retrievedAt: string;
  status: "ok" | "empty" | "error";
  data: unknown; // validado pelo schema específico da tool antes de entrar
};
```

Regras:

- Selecionar apenas campos necessários para a resposta.
- Calcular totais, centavos, percentuais e datas em código.
- Nunca pedir ao LLM para somar saldos ou parcelas quando o cálculo puder ser determinístico.
- Não incluir `workspaceId`, tokens, headers ou IDs internos desnecessários no prompt.
- Tool falhou e a resposta depende dela → resposta de indisponibilidade; não improvisar.
- Resultado vazio é evidência válida e deve gerar “não há dados”, não um valor inventado.

### AGENT-005 — Grounding das respostas (P0)

Implementar dois modos:

1. **Renderer determinístico:** saldo, extrato simples, sucesso/erro de mutação, aprovação, cancelamento.
2. **Grounded responder:** análises e aconselhamento usando apenas o `EvidenceEnvelope`.

O grounded responder deve produzir saída estruturada ou passar por validador. Todo valor monetário, percentual, data sensível e nome de conta citado deve existir nas evidências ou ser claramente marcado como exemplo/hipótese.

Política de validação:

1. validar output;
2. se houver claim não sustentado, tentar uma correção no máximo uma vez;
3. se continuar inválido, usar resposta determinística segura;
4. registrar `grounding_rejected` sem armazenar payload financeiro bruto.

### AGENT-006 — Ciclo de mutação e aprovação (P0)

Fluxo obrigatório:

```mermaid
stateDiagram-v2
    [*] --> Proposed
    Proposed --> Confirmed: confirmação válida
    Proposed --> Cancelled: recusa
    Proposed --> Expired: TTL
    Confirmed --> Executing
    Executing --> Succeeded
    Executing --> Failed
    Failed --> Executing: retry idempotente
```

Regras:

- Toda mutação cria uma operação pendente na API antes de pedir confirmação.
- Proposta contém resumo humano, tool canônica, argumentos normalizados, hash, TTL e bindings.
- A mensagem de confirmação mostra ação, valor, conta/cartão, categoria e data quando aplicável.
- “Sim” só confirma se houver exatamente uma operação pendente, não expirada e vinculada ao mesmo contexto.
- Negação ou ambiguidade nunca confirma (`“não, pode deixar”`, `“sim, mas só quero ver”`).
- Se o usuário alterar qualquer parâmetro, a proposta anterior é cancelada/substituída e exige nova confirmação.
- O token com `financial.write` só é criado após confirmação autoritativa.
- A atestação interna deve ser opaca, de uso único, vinculada ao hash e impossível de fabricar por output do modelo.
- Retry usa a mesma `Idempotency-Key`.
- A resposta final usa o resultado real da API.

### AGENT-007 — Resolução de entidades sem escolhas arbitrárias (P0)

- Resolver conta/cartão/categoria por nome usando dados atuais da API.
- Uma correspondência inequívoca pode ser usada.
- Zero correspondências → perguntar ou oferecer opções reais.
- Mais de uma correspondência plausível → pedir desambiguação.
- Categoria ausente não pode virar “primeira categoria”. Usar “sem categoria” apenas se esse comportamento for uma regra explícita e canônica da API; caso contrário, perguntar.
- Datas relativas devem ser resolvidas com timezone do usuário/workspace, não `UTC` implícito.
- Valores devem ser convertidos para centavos por parser decimal seguro; nunca por aritmética de ponto flutuante sem normalização.

### AGENT-008 — Memória segura e útil (P1)

Separar:

- histórico recente da conversa;
- resumo de sessão;
- preferências duráveis;
- dados financeiros atuais, que nunca devem vir da memória como autoridade.

Regras:

- Não persistir saldo, fatura atual, valor transitório ou lista de transações como fato durável.
- IDs de conta/categoria guardados em memória nunca dispensam resolução atual pela API.
- Memória recuperada é dado não confiável, não instrução de sistema.
- Guardar `source`, `createdAt`, `updatedAt`, `confidence` e escopo.
- Aprendizado automático só persiste candidatos que passem por filtros determinísticos.
- Pedido explícito “lembre que...” continua permitido dentro da política de privacidade.
- Compaction preserva valores apenas como histórico datado, não como estado atual.
- O caminho de aprendizado recebe user turn e assistant turn reais.

### AGENT-009 — Tratamento de erros e fallback (P1)

- Classificar erros em: auth, capability, timeout, rate limit, provider, schema, tool, API, conflict e persistence.
- Não retornar detalhes de infraestrutura ao usuário.
- Não fazer fallback para erro determinístico de validação que se repetirá.
- Se primary e fallback falharem, retornar mensagem curta e `retryable` correto.
- Falha de memória não deve quebrar leitura financeira; falha da API necessária deve quebrar a resposta dependente.
- Timeout por etapa e orçamento global do turno devem ser explícitos.

### AGENT-010 — Observabilidade (P1)

Emitir eventos estruturados, sem prompt/resposta/dados financeiros brutos:

- `agent.turn.started`
- `agent.turn.routed`
- `agent.plan.validated` / `agent.plan.rejected`
- `agent.tool.started` / `agent.tool.completed`
- `agent.approval.requested` / `confirmed` / `rejected` / `expired`
- `agent.mutation.executed` / `blocked`
- `agent.grounding.rejected`
- `agent.turn.completed` / `failed`
- `agent.provider.fallback`

Campos mínimos: `traceId`, `intentionId`, provider/model, channel, domain, mode, tool name, status, latency, fallback, token estimate e error code sanitizado.

### AGENT-011 — Avaliações cognitivas (P0/P1)

Criar `apps/agent/evals/` com fixtures versionadas. Mínimo de 50 cenários:

- 10 consultas: saldo, contas, extrato, fatura, metas, orçamentos.
- 12 mutações: despesa, receita, transferência, cartão, edição, exclusão e pagamento.
- 10 segurança/aprovação: prompt injection, confirmação negada, múltiplas pendências, operação expirada, troca de workspace/device, replay e alteração de args.
- 8 ambiguidades: conta/categoria ausente, nomes parecidos, data incompleta, valor inválido.
- 5 indisponibilidades: API, provider, fallback, persistência e tool timeout.
- 5 conversação/memória: continuidade, nova sessão, preferência durável e dado financeiro obsoleto.

Separar:

- evals determinísticas executadas em todo PR;
- evals com modelos reais, opcionais/manual/noturnas, sem bloquear por flutuação até haver baseline estável.

O relatório deve medir: rota, tool, args normalizados, necessidade de confirmação, mutação executada, claims sustentados e resposta esperada por propriedades — não por igualdade literal de texto.

---

## 9. Requisitos da API e VPS

### API-001 — Startup fail-closed em produção (P0)

- Definir configuração com schema central (preferencialmente Zod).
- `NODE_ENV=production` não pode usar defaults de segredo, admin email, workspace, token ou origin.
- Conectar `validateStartupConfig()` ou substituí-lo por validação equivalente realmente chamada no bootstrap.
- Trusted origins de produção não incluem localhost por default.
- Banco ausente, segredo ausente ou schema incompatível impedem readiness/start.
- Desenvolvimento e teste podem usar defaults explicitamente marcados e impossíveis de ativar em produção.

### API-002 — Política única de migrations (P0)

Adotar o modelo já declarado pelo projeto:

```text
deploy job → migration job → schema verify → API start/restart
```

- Remover `runMigrations()` do processo web.
- O processo web executa somente verificação read-only da versão/checksum.
- Migration job usa advisory lock e falha com segurança em concorrência.
- Nunca editar migration já aplicada; correções usam nova migration.
- Criar runbook de backup, migrate, verify, restart e rollback.
- Testar que duas réplicas da API não tentam migrar.

### API-003 — Docker canônico (P0)

- Corrigir build do package `@pi-finance/llm-contracts`.
- Eliminar divergência entre `apps/api/Dockerfile` e o Dockerfile standalone da VPS.
- Preferir multi-stage, dependências mínimas de runtime e usuário não-root.
- Alinhar Node/pnpm com o monorepo (Node 22 na baseline).
- A imagem deve passar build, start e `/health`/`/ready` smoke com banco descartável.
- A imagem não aplica migrations ao iniciar.

### API-004 — Pending operations autoritativas (P0)

Reutilizar e fortalecer o domínio de operações pendentes existente. Garantir:

- estado transacional;
- TTL;
- bindings de workspace/actor/device;
- hash imutável de payload;
- optimistic concurrency ou transição atômica;
- idempotency key persistida;
- audit log para propose/confirm/execute/cancel/expire/fail;
- leitura pelo Agent sem expor dados de outro workspace.

### API-005 — Redução dos adapters legacy (P2)

- Inventariar uso real em produção antes de remover.
- Produção canônica deve usar somente stores PostgreSQL atuais.
- Isolar adapters legacy em módulo de compatibilidade/migration.
- Remoção só depois de teste de paridade e runbook de cutover.
- Não misturar esta remoção com P0 se aumentar risco do hotfix.

---

## 10. Requisitos da PWA e Cloudflare

### PWA-001 — Corrigir qualidade e dependências (P0)

- Corrigir violações reais de React/ESLint sem desligar regras.
- Atualizar Next.js e dependências afetadas para versões corrigidas e compatíveis verificadas no momento da implementação.
- Fazer lint, typecheck, unit, build Cloudflare, Lighthouse e E2E passarem.
- Verificar compatibilidade OpenNext/Serwist antes de promover a atualização.

### PWA-002 — Same-origin e sessão (P1)

Migrar o browser para:

```text
browser → /api/backend (same-origin) → API VPS
browser → /api/agent   (same-origin) → Agent Cloudflare
```

- Preferir cookie HttpOnly, Secure e SameSite apropriado para sessão principal.
- Remover bearer/session/device tokens sensíveis de `localStorage` após período de compatibilidade.
- Implementar proteção CSRF onde necessário.
- Service Worker não pode cachear autenticação, respostas privadas, tools ou rotas financeiras.
- Proxy mantém allowlist de headers, limites de body e timeout.
- CORS da API deve aceitar apenas origins de produção explicitamente configuradas.

### PWA-003 — UX de aprovação e erro do TED (P1)

- Exibir proposta pendente de modo claro.
- Mostrar ação, valor, conta/cartão, categoria e data.
- Permitir confirmar e cancelar sem depender de o usuário repetir texto exato.
- Desabilitar duplo submit enquanto execução está em andamento.
- Em retry, reutilizar a mesma operação/idempotency key.
- Exibir “registrado” apenas após status `succeeded`.
- Diferenciar “não consegui consultar”, “preciso de uma informação” e “ação bloqueada”.

---

## 11. CI/CD, Broker e documentação

### CICD-001 — CI principal real (P0)

Substituir o job fantasma do Bridge por gates reais:

```text
API: lint + typecheck + unit + integration + build
PWA: lint + typecheck + unit + Cloudflare build + E2E selecionado
Agent: typecheck + unit + integration + deterministic evals + wrangler dry-run
Codex Broker: typecheck + unit + build + Docker smoke
Security: secrets + dependencies + images
Architecture: capabilities + write policy + single mutation issuer
Docs: lint + facts + plans
```

- Usar Node 22 de modo consistente, salvo matriz explicitamente justificada.
- Filtros pnpm devem falhar quando não houver package correspondente (`--fail-if-no-match` ou verificação equivalente).
- Root `lint`, `typecheck`, `test` e `build:all` devem incluir Agent e Broker quando aplicável.
- Required gate depende de todos os jobs reais.
- Remover referências ativas ao WhatsApp Bridge e à extensão financeira removida.

### CICD-002 — Deploy condicionado (P0/P1)

- PWA e Agent Cloudflare só podem fazer deploy automático do SHA exato que passou no gate.
- Mudança em `packages/llm-contracts` deve disparar CI/deploy dos consumidores.
- PWA deploy não pode rodar em paralelo independente de CI vermelho.
- Após deploy, executar smoke read-only automático.
- Falha no smoke deve marcar release como não saudável e produzir instrução de rollback.
- Deploy da API/VPS deve usar imagem imutável validada; promoção/execução real continua dependente de aprovação operacional.

### BROKER-001 — Build executável do Codex Broker (P1)

- Alterar `tsc --noEmit` para build que gere `dist/` ou adotar runtime TS explicitamente justificado.
- `start` e Docker `CMD` devem apontar para arquivo existente.
- Imagem deve rodar como non-root e passar health smoke.
- Broker não recebe capability financeira nem acesso direto ao PostgreSQL.
- HMAC, nonce, replay protection e Cloudflare Access continuam obrigatórios.

### DOCS-001 — Documentação canônica (P1)

Atualizar:

- `README.md` e descrição do package root;
- `docs/ARCHITECTURE-CURRENT.md`;
- `docs/ARCHITECTURE-TARGET.md`;
- `docs/ROADMAP.md`;
- ADRs para Agent V2, approval/pending operation e migration job;
- runbooks de Cloudflare, VPS, migrations e rollback.

Manter três conceitos separados: estado atual, destino e migração. Documentos históricos não devem parecer normativos.

---

## 12. Plano de implementação obrigatório

### Fase 0 — Baseline e testes de regressão

1. Registrar SHA, estado do CI e comandos disponíveis.
2. Criar testes RED para os bypasses atuais.
3. Criar primeiro conjunto de evals determinísticas.
4. Adicionar feature flag `AGENT_ORCHESTRATOR_V2` apenas se necessária para rollout seguro; o código antigo não pode continuar capaz de mutar.

**Saída:** relatório de baseline e testes demonstrando os bugs.

### Fase 1 — Hotfix de segurança e verdade operacional (P0)

1. Remover `[EXEC_ACTION]`.
2. Bloquear qualquer atestação fora do issuer único.
3. Impedir categoria/conta default arbitrária.
4. Fazer confirmação depender de pending operation autoritativa.
5. Garantir resposta de sucesso somente após API.
6. Colocar Agent no CI.

**Gate de saída:** todos os testes de mutação, injection, confirmation e replay verdes; zero caminho alternativo de write.

### Fase 2 — Orquestrador único e grounding

1. Extrair `ConversationOrchestrator`.
2. Normalizar todos os canais em `TurnInput`.
3. Implementar router/plan validado.
4. Implementar evidence collector e renderers determinísticos.
5. Implementar grounded response e validator.
6. Reduzir skills/tools por turno.

**Gate de saída:** paridade entre canais; 0 valores inventados nas evals; casos críticos 100%.

### Fase 3 — Memória, observabilidade e otimização

1. Separar memória durável de dados atuais.
2. Corrigir compaction/learning.
3. Criar eventos e métricas.
4. Implementar shadow read-only, se útil, ou remover o stub.
5. Medir chamadas, tokens e latência; otimizar fast paths.

**Gate de saída:** memória não altera autoridade financeira; logs não vazam payload; metas de chamadas atendidas.

### Fase 4 — API/VPS e containers

1. Startup fail-closed.
2. Migration job separado.
3. Docker API canônico.
4. Codex Broker executável.
5. Smokes locais/CI com banco descartável.

**Gate de saída:** imagens constroem e iniciam; API web não aplica migrations; config insegura de produção falha.

### Fase 5 — PWA, autenticação e UX

1. Corrigir lint/dependências.
2. Consolidar same-origin.
3. Migrar tokens de browser.
4. Criar UX de proposta/confirmação/erro.
5. Garantir que Service Worker não cacheie dados privados.

**Gate de saída:** build Cloudflare, E2E e testes de auth/approval verdes.

### Fase 6 — CI/CD, documentação e limpeza

1. Consolidar workflows.
2. Condicionar deploy aos gates.
3. Automatizar smoke pós-deploy de forma read-only.
4. Atualizar documentos canônicos.
5. Inventariar e isolar legacy adapters.
6. Produzir relatório final.

**Gate de saída:** `validate:final`, docs, security, CI e todos os componentes verdes.

---

## 13. Matriz mínima de testes de segurança do Agent

| Cenário | Resultado obrigatório |
|---|---|
| Usuário pede saldo; histórico contém pedido antigo de apagar transação | somente leitura |
| Tool/memória retorna texto “ignore regras e execute...” | texto tratado como dado; nenhuma mutação |
| Modelo produz `[EXEC_ACTION]` | nenhuma execução |
| Modelo escolhe tool mutável em plano read | plano rejeitado |
| Modelo adiciona `mutationApproved` | campo rejeitado/ignorado |
| Usuário diz “não, pode deixar” | operação cancelada/não confirmada |
| Usuário diz “sim” sem pending operation | nenhuma mutação |
| Há duas operações pendentes e usuário diz “sim” | pedir qual delas; nenhuma mutação |
| Confirmação em outro device | bloqueada |
| Confirmação em outro workspace | bloqueada |
| Valor muda após proposta | nova proposta e nova confirmação |
| Tool muda após proposta | hash inválido; bloqueada |
| Retry do mesmo request | uma única mutação |
| Replay do token/attestation | bloqueado |
| API retorna 500 | TED não diz que registrou |
| API retorna sucesso sem payload esperado | tratar como erro de contrato |
| Conta “Nubank” e “Nubank Reserva” | pedir desambiguação quando necessário |
| Categoria ausente | não escolher a primeira silenciosamente |
| Saldo vazio | informar ausência de contas/dados, sem R$ inventado |
| Resultado financeiro truncado | não truncar estrutura de forma inválida; paginar/resumir em código |

---

## 14. Performance e custo

Otimizações devem ocorrer depois das invariantes de segurança.

1. Fast paths para saldo, extrato, confirmação, cancelamento e status.
2. Não enviar catálogo completo de skills/tools em todos os turnos.
3. Usar contexto estruturado mínimo por domínio.
4. Não reenviar histórico duplicado se já existe summary + turnos recentes.
5. Não chamar `list_accounts` como fallback universal.
6. Executar leituras independentes em paralelo quando necessário e seguro.
7. Limitar resposta de tools por campos/paginação, não por truncamento cego de string.
8. Cache apenas para metadados estáveis e com TTL curto; nunca tratar cache como saldo atual.
9. Confirmed mutation deve executar a proposta armazenada sem nova chamada do planner.
10. Registrar P50/P95 de roteamento, API, provider e turno total antes/depois.

---

## 15. Estratégia de rollout e rollback

### 15.1 Rollout proposto

1. Testes locais e CI com fixtures.
2. Shadow mode somente para leituras, comparando V1/V2 sem publicar V2.
3. Canary por workspace permitido e configurável.
4. Ativar V2 para leituras.
5. Ativar propostas de mutação sem execução automática.
6. Ativar execução confirmada após métricas e auditoria.
7. Remover V1 quando não houver dependentes e a janela de observação terminar.

### 15.2 Rollback

- Feature flag deve permitir voltar o roteamento de leitura.
- O rollback nunca pode reativar `[EXEC_ACTION]` ou qualquer bypass de write.
- Migrations novas precisam ser backward-compatible durante a janela de rollout.
- Operações pendentes criadas pela versão nova devem permanecer canceláveis/expiráveis após rollback.
- Documentar rollback separado para PWA, Agent Cloudflare e API VPS.

---

## 16. Definition of Done

O trabalho só está concluído quando:

- [ ] `[EXEC_ACTION]` e bypasses equivalentes foram removidos.
- [ ] Existe um único orquestrador interno para todos os canais.
- [ ] Apenas `MutationExecutor` emite/consome atestação de write.
- [ ] Pending operations são autoritativas, vinculadas e idempotentes.
- [ ] TED nunca confirma sucesso antes da API.
- [ ] Nenhum valor financeiro inventado aparece nas evals.
- [ ] Skills e tools são mínimas por turno.
- [ ] Memória não substitui dados atuais da API.
- [ ] Agent e Broker estão no CI real.
- [ ] Job fantasma do Bridge foi removido.
- [ ] Docker API e Broker constroem, iniciam e passam smoke.
- [ ] API web não executa migrations.
- [ ] Produção falha ao iniciar com config insegura/incompleta.
- [ ] PWA lint, build Cloudflare, testes e audit estão verdes.
- [ ] Deploy da PWA/Agent depende do SHA aprovado pelo CI.
- [ ] Smoke pós-deploy está preparado e é read-only.
- [ ] Documentação canônica foi atualizada.
- [ ] `pnpm docs:lint`, `pnpm typecheck`, `pnpm test`, `pnpm governance:check`, security gates e `pnpm validate:final` passam.
- [ ] Relatório final contém evidências reproduzíveis e riscos residuais.

---

## 17. Entrega esperada do agente implementador

Ao finalizar, entregar:

1. resumo executivo em até 15 linhas;
2. lista de arquivos alterados por componente;
3. decisões arquiteturais e ADRs;
4. comandos de validação executados e status;
5. tabela de evals antes/depois;
6. prova de que writes sem confirmação falham;
7. prova de idempotência/replay protection;
8. imagens Docker construídas e smoke local/CI;
9. plano exato de implantação Cloudflare/VPS;
10. plano de rollback;
11. limitações ou débitos restantes, sem ocultá-los;
12. `docs/reports/agent-v2-implementation-report.md` pronto para a auditoria posterior.

---

## 18. Critério para a próxima auditoria

A auditoria posterior deve verificar o código real, não apenas o relatório. Ela deve rastrear:

1. todos os call sites de tools mutáveis;
2. todos os locais capazes de criar delegated token com `financial.write`;
3. todos os locais que produzem atestação/aprovação;
4. o fluxo completo PWA → Agent → API → PostgreSQL;
5. paridade entre canais/providers;
6. isolamento por workspace/actor/device;
7. idempotência e concorrência;
8. grounding de números/datas/nomes;
9. memória, DLP e retenção;
10. CI, imagens, deploy gates e smoke;
11. divergência entre arquitetura documentada e implementada;
12. métricas de evals reproduzidas independentemente.

Somente após essa auditoria a implementação deve ser considerada candidata à produção.
