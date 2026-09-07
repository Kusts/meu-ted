# Auditoria estática — Ondas 3–4

**Data:** 2026-09-07  
**Branch:** `main`  
**Escopo:** `4c25807..886e80c` (`HEAD=886e80c`)  
**Extensão informada:** 21 commits, 261 arquivos  
**Veredito:** **REPROVADO para aceite imediato**

## 1. Escopo, método e limitações

Esta revisão cobre somente as alterações entre `4c25807` e `HEAD=886e80c`, dando continuidade ao relatório [Ondas 1–2](./review-ondas-1-2-2026-09-07.md). Foram examinados o diff, os contratos TypeScript, os caminhos de autorização e memória, os read models/SQL, os executores de LLM, as superfícies de analytics e os testes/referências existentes.

A análise é **estática**. Não houve validação em produção ou staging, browser real, Durable Object com SQLite real, provider upstream, streaming E2E, nem fluxo financeiro E2E. Testes unitários de helpers, schemas, mappers ou configuração não são tratados como prova de integração entre PWA, API, Agent, Durable Object, PostgreSQL e providers.

As alterações locais fora do intervalo foram excluídas da atribuição: `.gitignore`, `apps/pwa/src/components/PageHeader.tsx`, `apps/pwa/src/components/__tests__/PageHeader.test.tsx`, `apps/pwa/docs/` e `apps/pwa/scripts/shot-ia-preview.mjs`. Também não foram reabertos, sem evidência nova, problemas preexistentes de bridge, `API_ORIGIN`, cache geral, CI, `pnpm-workspace.yaml` ou `apps/agent/src/tools/api-client.ts`.

Premissas mantidas da revisão anterior:

- aliases explicitamente autorizados, inclusive a distinção entre `openai-api` e `openai-codex-subscription`, não foram classificados como segredo;
- segredos continuam sendo lidos de `process.env`;
- respostas e mensagens de erro mascaradas, fixtures `sk-*` e o broker Codex protegido foram tratados como premissas de teste/arquitetura, não como vazamentos;
- a revisão não autoriza ativação de produção quando a integração correspondente não foi demonstrada.

## 2. Resumo executivo

Houve progresso relevante no intervalo:

- o anti-replay passou a ser consumido no caminho produtivo do Agent (`apps/agent/src/index.ts:501-518`), com segundo uso tratado como replay/409;
- `resolveCanonicalHouseholdId` passou a falhar fechado em erro de rede, HTTP inválido ou ausência de canonical;
- V047/V048, `findOrCreateStatementTx` e o runner de migrações foram revisados com unicidade, deduplicação, upsert e checksum no caminho estático;
- `executeLlmAttempts` unificou os caminhos direct, buffered e broker, resolve nomes upstream, limita o fallback, classifica retry e sanitiza erros; `createSafeFetch` rejeita redirects;
- escopo de `agent_memory`, `agent_prefs` e `agent_sessions` foi amarrado a workspace/ator, e a exportação filtra o ator e mascara mensagens/actions/events;
- wrappers de tools agora verificam intenção de mutação e emitem atestação vinculada à tool para o executor gerado.

Essas melhorias reduzem alguns achados das Ondas 1–2, mas não comprovam segurança e integridade de ponta a ponta. Permanecem riscos de namespace do Durable Object, identidade do ator/dispositivo, persistência de dados sensíveis, filtragem incompleta de analytics, cache de filtros fora do escopo, logout, revogação durante streaming e comportamento sob indisponibilidade da autoridade.

A entrega, portanto, continua **reprovada para aceite imediato**. O bloqueio não decorre apenas da ausência de testes E2E: há divergências estáticas concretas nas fronteiras de identidade e nos contratos de escopo.

## 3. Progresso verificado e limites da evidência

| Área | Evidência positiva no intervalo | Limite que permanece |
|---|---|---|
| Anti-replay | `consumeAgentToken` é chamado no Worker; replay retorna conflito | Falta prova de concorrência real contra PostgreSQL/DO e de revogação durante stream |
| Workspace canonical | resolução falha fechado quando a API não confirma o canonical | o namespace do DO ainda usa o alias bruto em outro ponto |
| Cartão/statements | V047 e `findOrCreateStatementTx` estabelecem unicidade/upsert no código revisado | PostgreSQL real, corrida concorrente e dados legados não foram exercitados |
| Categorias | V048 e resolvedores validam active/kind/parent no caminho de escrita | não há fixture de banco real demonstrando constraint, índices e todas as referências |
| LLM | tentativas direct/buffered/broker compartilham executor, retry limitado e erro sanitizado | não houve provider upstream, streaming E2E ou falha injetada pós-criação do stream |
| Redirects | `createSafeFetch` rejeita redirects | a cobertura estática não substitui teste de rede com header autenticado |
| Memória | tabelas e exportação usam workspace/ator e mascaramento de mensagens/actions/events | anexos, transcripts completos e todos os sinks posteriores não estão cobertos por uma política única |
| Approval/capability | wrapper valida intenção e fornece atestação por tool | a ligação completa da capability, approval store e rota financeira não foi exercitada em runtime |

## 4. Achados críticos e altos residuais

### C-05 — Autorização usa o canonical, mas o Durable Object é nomeado pelo alias bruto

- **Severidade:** CRITICAL
- **Critérios relacionados:** 7; isolamento por workspace/ator; memória e histórico.
- **Evidência:** `apps/agent/src/worker.ts:199-208` autoriza com o workspace canonical, mas chama `idFromName(workspaceId)` usando o valor recebido, que pode ser alias bruto.
- **Impacto:** o mesmo workspace pode ter dois namespaces de Durable Object, um derivado do alias e outro do canonical. Histórico, memória, sessão, locks e estado de aprovação podem ser gravados em DOs diferentes. Além de quebrar revogação e continuidade, isso cria uma fronteira de isolamento incoerente: a autorização valida uma identidade e a persistência escolhe outra.
- **Correção exigida:** resolver o canonical antes de qualquer `idFromName`, usar somente o identificador canonical para nomes e chaves persistentes e rejeitar alias não resolvido. Deve existir migração/compatibilidade explícita para DOs criados com alias, sem misturar dados silenciosamente.
- **Verificação necessária:** teste de integração que conecte pelo alias e pelo canonical e prove o mesmo DO, seguido de teste cross-workspace que tente acessar histórico, memória e aprovação do outro namespace.

### C-06 — `actorId` chega pelo payload de chat sem prova de vinculação à identidade autenticada

- **Severidade:** CRITICAL
- **Critérios relacionados:** 7; integridade de auditoria; memória.
- **Evidência:** `apps/agent/src/finance-chat-agent.ts:423-432` processa `actorId` recebido em `onChatMessage`. A inspeção não encontrou prova suficiente de que esse valor seja sempre derivado dos claims autenticados e comparado com o ator efetivo antes de memória, transcript, tool call ou auditoria.
- **Impacto:** um cliente que consiga enviar outro `actorId` pode tentar atribuir turnos, preferências, histórico ou ações a outro ator. Mesmo que queries posteriores tenham filtros defensivos, confiar no campo do payload fragiliza atribuição, auditoria e isolamento lógico.
- **Correção exigida:** ignorar `actorId` fornecido pelo cliente como fonte de identidade; derivar o ator do contexto autenticado/delegated token, comparar qualquer campo auxiliar e rejeitar mismatch. O ator efetivo deve ser passado por uma estrutura imutável para memória, tools, auditoria e exportação.
- **Verificação necessária:** teste de spoof com `actorId` diferente do claim, inclusive em tool mutating, histórico, exportação, compactação e sessão concorrente.

### H-09 — Redaction de transcript não cobre PAN, anexos e todos os sinks duráveis

- **Severidade:** HIGH
- **Critérios relacionados:** 1 e 7; privacidade de dados financeiros.
- **Evidência:** `apps/agent/src/transcript-safety.ts:1-11` não possui regra explícita para números de cartão/PAN. O `CARD_NUMBER_RE` usado em `agent_memory` é limitado. O `/rpc/chat` calcula texto redigido em `apps/agent/src/finance-chat-agent.ts:668-687`, mas a análise não demonstrou que anexos, transcript bruto, compactação, aprendizagem, sessões, eventos e exportações posteriores passem pela mesma proteção.
- **Impacto:** mascarar a resposta entregue ao cliente não garante que o PAN fique ausente de logs, memória, transcript, anexos, resumo, eventos ou backup. Um usuário pode inserir número de cartão, CVV ou documento em texto/anexo e o dado persistir em uma superfície não coberta.
- **Correção exigida:** centralizar uma política de DLP/redaction antes de cada escrita e exportação; cobrir PAN com validação adequada (inclusive separadores e variantes), CVV, credenciais e documentos; rejeitar ou armazenar anexos em fluxo isolado e explicitamente protegido. Não usar apenas regex de memória como controle global.
- **Verificação necessária:** fixtures com PAN válido, PAN separado por espaços, CVV, imagem/anexo, transcript compactado, exportação e falhas de tool; comprovar que nenhum sink durável recebe o valor cru.

### H-10 — `accountId` não é propagado por todas as fontes de analytics

- **Severidade:** HIGH
- **Critérios relacionados:** 6 e 7; correção de métricas financeiras.
- **Evidência:** `apps/api/src/analytics/source.ts:38-49` aceita `accountId` em parte das consultas, mas `monthlyFlows`, orçamento, patrimônio, custos fixos/discricionários e subscriptions/recurring não o propagam de forma uniforme. `apps/api/src/types/domain.ts:153-164` não modela conta para subscriptions. `apps/pwa/src/features/reports/ReportsPage.tsx:314-323` mantém cálculos antigos junto da nova zona de relatórios.
- **Impacto:** selecionar uma conta pode filtrar algumas séries e deixar outras agregadas no household inteiro. O dashboard pode exibir saldo, fluxo, orçamento ou custo recorrente com universos diferentes e induzir decisões financeiras incorretas. A coexistência de duas implementações na PWA aumenta o risco de divergência visual e de contrato.
- **Correção exigida:** definir um `AccountScope` obrigatório para todas as fontes que suportam conta; modelar a relação de subscriptions/recurring ou declarar formalmente que são household-only; remover o cálculo antigo da tela e manter uma única fonte de verdade.
- **Verificação necessária:** fixture com duas contas no mesmo household, lançamentos e recorrências cruzadas, e asserts para cada métrica com filtro de uma conta, múltiplas contas e sem filtro.

### H-11 — Filtros de analytics persistidos em chave global de navegador

- **Severidade:** HIGH
- **Critérios relacionados:** 7; isolamento de sessão/workspace.
- **Evidência:** `apps/pwa/src/components/filters/analytics-filters.tsx:14` usa a chave fixa `meu-ted:analytics-filters`, sem workspace, household, ator ou versão de esquema.
- **Impacto:** após troca de workspace, logout/login ou alternância de ator no mesmo navegador, filtros antigos são reaplicados no novo contexto. Mesmo sem enviar dados ao servidor, isso pode exibir um recorte incorreto, mascarar contas ou induzir consultas no escopo errado; se filtros futuros incluírem identificadores, a chave global também vira risco de mistura de contexto.
- **Correção exigida:** escopar a chave por workspace canonical e ator, limpar no logout/troca de workspace e versionar/migrar o formato. O servidor continua sendo a autoridade de escopo; localStorage não pode substituir essa validação.
- **Verificação necessária:** teste de troca A→B→A no mesmo browser/contexto, logout seguido de login de outro usuário e filtros inexistentes/obsoletos.

### H-12 — `deviceId` não possui binding end-to-end no delegated token/API

- **Severidade:** HIGH
- **Critérios relacionados:** 7; replay, sessões e histórico.
- **Evidência:** `deviceId` aparece no token consumido pelo Agent (`apps/agent/src/delegated-token.ts`), mas não é declarado/verificado de forma equivalente em `apps/api/src/auth/delegated-token.ts` e no caminho de `/rpc` em `apps/api/src/routes/index.ts:244-270`.
- **Impacto:** o campo opcional no Agent não constitui binding de dispositivo. Token, sessão ou histórico podem ser reutilizados por outro dispositivo enquanto assinatura, actor e workspace continuarem válidos. A proteção contra replay fica dependente de TTL/consumo, sem revogação específica por dispositivo.
- **Correção exigida:** declarar `deviceId` no contrato assinado na API, emitir e verificar o mesmo valor em cada boundary, associá-lo à sessão/revogação e derivar identidade de claims, nunca de headers livres. Compatibilidade sem device deve ser explicitamente read-only ou rejeitada para operações sensíveis.
- **Verificação necessária:** token emitido para dispositivo A usado em B, troca/revogação de dispositivo, mismatch de header e acesso a histórico/tool mutating.

### H-13 — Logout ainda não tem prova de limpeza do cache de token do Agent

- **Severidade:** HIGH
- **Critérios relacionados:** 7.
- **Evidência:** `apps/pwa/src/lib/api/agent-auth.ts:8-50` define `clearAgentConnectionTokenCache`, enquanto `apps/pwa/src/lib/session.ts:16-17,39-93` limpa o estado principal de sessão. A análise de referências permanece sem prova de chamada central no logout/troca de usuário/workspace.
- **Impacto:** um bearer delegado mantido em memória pode ser reutilizado depois de logout ou troca de contexto até sua expiração, especialmente quando a tela de chat permanece montada. Isso combina com a ausência de binding de dispositivo e amplia a janela de uso indevido.
- **Correção exigida:** chamar a limpeza no logout, expiração/401, troca de workspace e troca de usuário; cancelar conexões/streams ativas e invalidar o snapshot local correspondente.
- **Verificação necessária:** logout→login de outro usuário, troca rápida de workspace, 401 no turno e desmontagem/remontagem da tela com cache previamente preenchido.

### H-14 — `securityEpoch` e rollout stale não interrompem streams já iniciados

- **Severidade:** HIGH
- **Critérios relacionados:** 2, 3 e 7; revogação de provider/configuração.
- **Evidência:** `apps/agent/src/llm/rollout.ts:13-18` mantém o snapshot quando a autoridade fica indisponível; `apps/agent/src/finance-chat-agent.ts:300-321` verifica epoch antes da tentativa, mas não há cancelamento ativo comprovado para um stream já criado quando o epoch sobe.
- **Impacto:** uma revogação, troca de provider, modo `disabled` ou alteração de rollout pode não produzir efeito até a expiração do cache ou o fim do stream. Em indisponibilidade da autoridade, a continuidade com snapshot antigo é uma escolha de disponibilidade, não uma prova de revogação fail-closed.
- **Correção exigida:** definir a política explicitamente: alterações de segurança devem falhar fechado quando a autoridade não puder ser consultada; comparar epoch/versão também durante a resposta; propagar `AbortController`/cancelamento ao stream e impedir publicação de chunks após revogação.
- **Verificação necessária:** bump de epoch durante inferência lenta, autoridade indisponível antes e durante o turno, provider desabilitado, canary alterado e stream que falha depois do primeiro chunk.

### M-10 — V048 e referências repontadas ainda não têm prova com banco real

- **Severidade:** MEDIUM, podendo elevar-se a HIGH se o schema divergir em produção
- **Critérios relacionados:** 4 e 6.
- **Evidência:** a revisão estática confirmou a unicidade de categorias e os resolvedores `assertCategoryNameFree`/`resolveSubcategoryInTx`, mas não houve fixture PostgreSQL real para todas as referências repontadas por V048. O checksum do runner também foi revisado estaticamente, não contra um banco já migrado e um caso de drift.
- **Impacto:** conflitos de case-folding, índice existente, dados duplicados, FK e ordem de migração podem falhar somente no startup ou em concorrência. O código pode parecer idempotente sem demonstrar que a constraint/upsert preserva todos os dados existentes.
- **Correção exigida:** adicionar migração de teste em banco real com dados duplicados/legados, duas escritas concorrentes, rollback/falha intermediária e checksum alterado após aplicação; verificar todas as chamadas de categoria e subcategoria.

### M-11 — Coverage de capability/approval é estática, não runtime

- **Severidade:** MEDIUM até prova de execução; HIGH para mutações financeiras
- **Critérios relacionados:** 1 e 7.
- **Evidência:** `apps/agent/src/agent-config/tools.ts:241-267` valida intenção, approval e entrega `mutationApproved`/`approvedTool` ao executor gerado; o mapa em `apps/agent/src/safety/tool-approvals.ts` e a configuração foram revisados. Isso comprova a intenção do wrapper, não que toda capability, rota, store e caminho alternativo rejeite uma mutação sem approval em runtime.
- **Impacto:** uma tool não incluída no mapa, uma rota chamada fora do wrapper ou um store ausente pode transformar o atestado estático em bypass. A ausência de teste de execução deixa sem prova o requisito fail-closed.
- **Correção exigida:** teste de cada mutação gerada e destrutiva com capability ausente, approval expirado, store indisponível, tool mismatch, actor/workspace mismatch e idempotency key ausente; negar por padrão.

## 5. Matriz dos critérios de aceite

| # | Critério | Veredito nesta onda | Evidência e conclusão |
|---:|---|---|---|
| 1 | Nenhuma key/secret em código, log ou fixture; provider-registry mascarado | **PARCIAL** | Não foi encontrado segredo de produção atribuído ao intervalo; aliases e valores de teste foram mantidos como premissas. O executor sanitiza falhas e `createSafeFetch` rejeita redirects. Ainda não há teste upstream/redirect com header real nem prova de todos os sinks de PAN/anexos (H-09). |
| 2 | Failover na mesma requisição, erro claro, sem loop infinito e métrica sem segredos | **PARCIAL** | `executeLlmAttempts` unifica direct, buffered e broker, resolve o upstream, limita fallback e classifica retry. A autoridade pode manter snapshot stale e streams não são abortados após revogação/epoch (H-14); streaming e provider real não foram exercitados. |
| 3 | Modelos dinâmicos com TTL; ativo/fallback persistido e único; rollout seguro | **PARCIAL** | Runtime mapper, snapshots, protocolos e IDs foram revisados. `rolloutMode`, canary e `securityEpoch` não têm prova operacional durante stream ou indisponibilidade da autoridade; a semântica de fallback stale continua condicionada a teste real. |
| 4 | V047/V048 aditivas, idempotentes e sem perda; migrate íntegro | **PARCIAL** | Unicidade de statements/categorias, deduplicação, upsert e checksum estão presentes estaticamente. Falta banco PostgreSQL real, concorrência, dados legados e detecção de drift já aplicado (M-10). |
| 5 | Origem conta XOR cartão na UI/API (422); parcelas só cartão | **REPROVADO — carry-over** | A validação de boundary existe, mas a revisão anterior registrou H-01/H-04: a compra à vista selecionada como cartão pode seguir o caminho genérico e perder a fatura. Esta onda não trouxe prova nova suficiente para limpar o bloqueador; o fluxo E2E de cartão continua ausente. |
| 6 | Árvore de categorias, exclusão, defaults e `subcategoryId` compatíveis | **PARCIAL** | V048 e resolvers melhoram unicidade e compatibilidade; a revisão estática não prova as constraints/relacionamentos em banco real. O comportamento balance-aware de cascata e os casos de cartão/parent/kind permanecem condicionados aos achados anteriores e ao teste de integração. |
| 7 | Membros aceitos com papel/status, refresh e membership server-side | **REPROVADO** | Membership e escopos de memória melhoraram, mas alias/canonical no DO (C-05), `actorId` do payload (C-06), device binding (H-12), logout/cache (H-13), filtros persistidos (H-11) e epoch/stream (H-14) impedem considerar o isolamento comprovado. |
| 8 | Rename sem filtros/CI quebrados e sem path absoluto novo | **APROVADO ESTATICAMENTE** | Não foi identificado novo path absoluto ou regressão de rename atribuível às Ondas 3–4; `pnpm governance:check` passou. O veredito é estático, não substitui CI completo. |
| 9 | Marca, manifest/metadata, ícones e ausência de “Pi Financeiro” em produção | **APROVADO ESTATICAMENTE** | Não foi identificado regressão nova na superfície de marca revisada. Não houve browser/deploy real para provar o artefato final servido. |
| 10 | Sem regressão de acessibilidade básica | **APROVADO ESTATICAMENTE** | Contratos e atributos básicos permanecem presentes nas superfícies examinadas. Não houve leitor de tela, device real ou validação visual E2E. |

## 6. Verificações executadas

| Verificação | Resultado | Interpretação |
|---|---|---|
| `git diff --check` | **PASSOU** | Não há whitespace error no diff auditado. |
| `pnpm typecheck` | **PASSOU** | Tipos compilam; isso não prova runtime, banco ou provider. |
| `pnpm docs:lint` | **PASSOU** | Documentação está conforme o lint disponível. |
| `pnpm governance:check` | **PASSOU** | Governança declarada passou; não substitui os testes de integração. |
| `pnpm capabilities:check` | **PASSOU** | Catálogo/capabilities estático passou; não prova approval em execução. |
| `pnpm write-policy:check` | **NÃO CONCLUÍDO / FALHOU** | Vários IDs de endpoint não foram descobertos; a falha não foi convertida em aprovação. |
| `pnpm test` | **SEM EVIDÊNCIA NESTA REVISÃO** | Não deve ser apresentado como gate aprovado. |
| Runtime/staging/browser/DO/provider/stream/financeiro E2E | **NÃO EXECUTADO** | Limitação explícita desta auditoria. |

## 7. Condições para novo aceite

1. Corrigir o namespace do DO para usar exclusivamente o workspace canonical e migrar/invalidar namespaces criados por alias.
2. Derivar `actorId`, workspace e device apenas de contexto autenticado; completar o contrato de `deviceId` na API, Agent e sessões; rejeitar spoof/mismatch.
3. Limpar cache e conexões do Agent em logout, 401, troca de usuário e troca de workspace.
4. Aplicar redaction/DLP antes de qualquer escrita ou exportação de transcript, memória, resumo, sessão, evento e anexo; incluir PAN/CVV e fixtures com separadores/anexos.
5. Propagar `accountId` por todas as fontes de analytics ou declarar fontes household-only de forma explícita; remover o cálculo duplicado de `ReportsPage`.
6. Escopar filtros persistidos por workspace canonical e ator e testar troca de contexto no mesmo navegador.
7. Definir revogação fail-closed para mudanças de segurança, comparar epoch durante o stream e abortar streams ativos; testar autoridade indisponível, bump durante inferência e provider disabled.
8. Executar fixtures PostgreSQL reais para V047/V048, statements, categorias, concorrência, drift e dados legados; repetir todos os caminhos de aprovação/capability.
9. Reexecutar `pnpm test` e os gates de tipo, docs, governança e capabilities; tratar `write-policy:check` até obter resultado válido.
10. Fazer smoke/integration E2E com browser, DO SQLite real, API autoritativa, providers upstream, direct/buffered/broker, streaming, replay, logout, dois workspaces, duas contas, cartão 1x, parcelas e cascata de categoria.

Nenhuma correção de código foi realizada nesta auditoria; este documento registra evidência e condições para a próxima rodada.

## 8. Proveniência e coordenação

A revisão utilizou somente a tarefa Orca existente `task_3f241fc63a7c`, contexto `ctx_049e1c35198e` e run `run_5bbc09039da4`; não foi criado dispatch paralelo nem reutilizado `ORCA_AGENT_LAUNCH_TOKEN`.

O runtime desta sessão não disponibilizou uma capability oficial `dcap_...`. Tentativas sem essa capability foram rejeitadas pelo runtime; por isso não há `worker_done` aceito a registrar. A ausência do lifecycle Orca não altera o veredito técnico deste relatório.
