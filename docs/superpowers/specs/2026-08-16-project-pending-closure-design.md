# Goal Mestre de Encerramento das Pendências — Design

> **Status:** aprovado pelo usuário em 2026-08-16
> **Escopo:** 25 itens canônicos G6–G7–VAL e bloqueios atuais verificados
> **Autonomia:** máxima segura
> **Conclusão:** rubrica final ≥ 90/100, sem veto crítico

## 1. Objetivo

Encerrar todo o trabalho acionável atual do `pi-financeiro` em um único programa lógico, reiniciável e auditável. O programa estabiliza a baseline, conclui G6.2.1–G6.GATE, sincroniza a documentação em G7.1–G7.5 e executa VAL.1–VAL.10.

O programa possui uma identidade única, chamada **Goal Mestre**, uma fila persistente e uma rubrica final. A execução não depende de um único processo ou contexto: `pi-tasks` preserva o estado e cada condição `/goal` interna cobre somente a entrega verificável atualmente desbloqueada.

## 2. Fontes de verdade

Em ordem de precedência:

1. esta especificação define o programa aprovado;
2. `pi-tasks` mantém ordem, estado, blockers, critérios e evidências;
3. planos em `docs/superpowers/plans/` detalham a implementação aprovada de cada macrofase;
4. `docs/goals/` mantém o contrato de retomada e as condições `/goal` necessárias entre sessões;
5. código, testes e outputs executados prevalecem sobre checkboxes ou status documentais antigos.

Documentos históricos podem fornecer evidência, mas não reabrem ideias arquivadas nem substituem o estado do repositório atual.

## 3. Escopo canônico

### 3.1 Pendências do programa

O programa inclui:

- **G6.2.1:** todas as capabilities do Pi passam pela API HTTP autenticada, com workspace server-side, idempotência e zero SQL direto nos boundaries ativos;
- **G6.2.2–G6.2.4:** Agent shadow read-only, bridge com identidade resolvida no servidor e ownership único por estágio;
- **G6.2.5–G6.2.7:** freeze de writes legados, aceite de paridade e soak com rollback exercitado;
- **G6.2.8–G6.2.9:** retirada controlada do webhook/Evolution/bridge/`.pi` e tratamento de secrets e referências residuais;
- **G6.GATE:** 48 horas sem dependência crítica do WhatsApp, sem alerta crítico, com integridade e rollback comprovados;
- **G7.1–G7.5:** documentação canônica, ADRs ativas, arquivo de planos superados e lint documental;
- **VAL.1–VAL.10:** instalação frozen, lint, typecheck, unit/contract, coverage, integração PostgreSQL, E2E, build, segurança e smoke read-only de produção.

### 3.2 Bloqueios atuais incorporados

O programa também inclui a remediação dos bloqueios observados em 2026-08-16:

- working tree com 43 arquivos modificados e 519 não rastreados, sem ownership consolidado;
- suíte da API com 36 arquivos e 182 testes falhos, incluindo gaps de registro de rotas, autenticação/autorização, audit logs, dashboard, payables e pending operations;
- suíte da PWA com 348 testes aprovados, mas 44 erros de inicialização/timeout de workers Vitest;
- typecheck do bridge falhando em `apps/whatsapp-bridge/src/webhook-bridge.test.ts:500` por incompatibilidade `Buffer` versus `string`;
- conflito entre o status pausado de G6.1.2 no documento de retomada e o status concluído no design mestre posterior;
- planos com checkboxes antigas que contradizem gates e goal-runs posteriores;
- ausência de uma interface root uniforme para todos os comandos VAL;
- dependências de ambiente para PostgreSQL descartável, Hostinger VPS, Cloudflare, VAPID, Evolution e secrets.

### 3.3 Fora de escopo

- reabrir ideias arquivadas sem relação com os 25 itens ou seus blockers;
- adicionar novas features de produto durante o programa;
- substituir PostgreSQL, Cloudflare ou Hostinger por preferência técnica;
- usar `../pi-finance-web`, que permanece depreciado;
- tratar processos locais Windows como fonte de verdade da produção;
- reduzir critérios, ocultar skips ou converter falhas em avisos para encerrar o Goal Mestre.

## 4. Arquitetura de execução

### 4.1 Contrato em duas camadas

- **Camada persistente:** um task program no `pi-tasks` representa o Goal Mestre completo, suas macrofases e dependências.
- **Camada de execução:** uma condição `/goal` representa somente a entrega ativa. Após evidência e fechamento, a próxima condição é emitida a partir do estado persistente.

Essa composição mantém uma missão única para o usuário sem depender de um `/goal` monolítico, que não sobreviveria a reinícios e teria baixa verificabilidade.

### 4.2 Estado de uma entrega

Cada entrega passa por:

`pending → active → review → done`

ou

`pending/active → blocked → active`

Somente uma entrega pode estar ativa. Uma entrega concluída não é reaberta sem regressão reproduzível ou mudança explícita de requisito.

### 4.3 Regra de avanço

A próxima entrega só é ativada quando:

- todos os critérios da entrega atual possuem evidência;
- testes obrigatórios não contêm falhas ou skips incompatíveis;
- revisão do diff não encontra blocker;
- rollback/checkpoint exigido foi registrado;
- nenhum consent gate necessário está pendente.

Falha não vira warning. Um gate vermelho cria ou ativa uma entrega de remediação antes de qualquer avanço.

## 5. Macrofases

### P0 — Estabilização e consolidação

1. preservar e classificar o working tree por origem, escopo e entrega;
2. separar artefatos do projeto de temporários e resíduos de tooling;
3. corrigir a baseline da API, PWA e bridge sem mascarar regressões;
4. reconciliar G6.1.2 e demais status documentais conflitantes por evidência executada;
5. definir comandos canônicos por workspace e aliases root necessários para VAL;
6. registrar baselines de ambiente, PostgreSQL descartável, topologia Hostinger e Cloudflare sem expor secrets.

**Gate P0:** checkout e ownership compreensíveis; baseline reproduzível; nenhum blocker desconhecido impede G6.2.1.

### P1 — G6.2.1: API migration e boundaries

1. reconciliar tool registry, capability inventory, OpenAPI, route inventory e adapters gerados;
2. implementar endpoints autenticados ausentes, incluindo pending operations, undo, cards, parcelamentos, recorrências, notificações, status e insights;
3. derivar workspace e actor exclusivamente do contexto autenticado;
4. preservar idempotência, auditoria e isolamento cross-workspace;
5. remover `pg`, SQL, `DATABASE_URL` e shadow reads dos boundaries ativos;
6. manter facades legadas apenas como delegadores HTTP durante a transição.

**Gate P1:** capabilities registradas 1:1 com API e adapters; scans de boundary, testes de contrato, authz, idempotência e typecheck verdes.

### P2 — G6.2.2–G6.2.7: shadow, bridge, ownership, freeze e soak

1. executar o Agent shadow sem resposta ou side effect;
2. medir divergência com dados sanitizados;
3. integrar bridge → Agent com `phone → user → workspace` resolvido server-side;
4. provar exatamente um runtime respondendo/executando por estágio;
5. usar feature flags para rollout e rollback;
6. congelar writes Pi preservando fallback read-only;
7. coletar aceite capability por capability;
8. executar soak técnico com rollback exercitado.

**Gate P2:** paridade aprovada, ownership único e rollback reproduzível.

### P3 — G6.2.8–G6.GATE: retirada controlada

1. inventariar arquivos, serviços, webhooks, secrets e referências a remover;
2. criar backup e checkpoint de rollback;
3. remover ou arquivar por estágio, nunca em lote não revisado;
4. rotacionar secrets somente após consentimento explícito;
5. verificar referências residuais em código/configuração ativos;
6. observar a janela de 48 horas com métricas, alertas e integridade.

**Gate P3:** nenhum fluxo crítico depende do WhatsApp; zero alerta crítico na janela; dados íntegros; rollback documentado e testado.

### P4 — G7.1–G7.5: documentação e governança

1. reescrever README e AGENTS conforme a arquitetura real;
2. criar ou atualizar `PRODUCT.md`, `ARCHITECTURE-CURRENT.md`, `ARCHITECTURE-TARGET.md` e `ROADMAP.md`;
3. manter ADRs ativas em `docs/adr/`;
4. arquivar specs e planos superados;
5. deixar em `docs/superpowers/plans/` apenas planos ativos com status correto;
6. adicionar lint de links internos e fatos contáveis.

**Gate P4:** documentação canônica consistente com código e topologia; lint documental verde.

### P5 — VAL.1–VAL.10: validação e rubrica

Executar em ordem:

1. instalação frozen;
2. lint;
3. typecheck;
4. unit/contract sem DB externo;
5. coverage ≥ 80% conforme contrato canônico;
6. integração com PostgreSQL descartável e guards ativos;
7. E2E de fluxos críticos e authz;
8. builds da API, bridge transitório, PWA e Agent;
9. secrets, dependências, SAST e containers sem CRITICAL;
10. smoke read-only de produção para health, auth deny, assets e rollback.

Uma falha cria remediação e reinicia o gate afetado. Gates anteriores só são repetidos quando a remediação toca seu escopo.

## 6. Autonomia máxima segura

Sem pedir confirmação, o agente pode:

- editar código, testes e documentação do repositório;
- criar migrations aditivas e executá-las em banco descartável com guards;
- instalar dependências exigidas pelo plano, atualizando lockfile por comando reproduzível;
- criar commits/checkpoints com staging explícito de arquivos do item atual;
- refatorar somente quando necessário ao contrato ativo;
- executar revisão, scanners, builds e verificações read-only locais ou de produção;
- criar automaticamente entregas de remediação para blockers técnicos;
- mudar de abordagem após duas falhas idênticas.

O agente deve pausar antes de:

- mutação ou deploy em produção;
- criação, leitura, rotação ou remoção de secrets/credenciais reais;
- custo externo novo;
- comunicação externa em nome do usuário;
- remoção irreversível de dados, runtime, webhook, bridge ou `.pi/`;
- decisão de produto que altere o escopo aprovado.

Cada pausa apresenta operação exata, impacto, backup, rollback e prova prévia.

## 7. Política de blockers e recuperação

Todo blocker recebe exatamente um estado:

- **Resolvido:** prova reproduzível anexada;
- **Remediável:** ação técnica conhecida e promovida a entrega anterior;
- **Externo:** aguarda apenas o consent gate indispensável;
- **Aceito:** risco limitado, responsável e rollback definidos;
- **Não aplicável:** descartado por evidência.

Ciclo de recuperação:

1. primeira falha: capturar output completo e formular hipótese testável;
2. segunda falha idêntica: parar repetição, registrar blocker e escolher abordagem ortogonal;
3. regressão: restaurar o último checkpoint verde sem apagar trabalho alheio;
4. falha ambiental: criar guard fail-closed e procedimento reproduzível;
5. conflito arquitetural: retornar ao gate anterior e atualizar spec/ADR antes do código.

Checkpoints são obrigatórios após cada entrega verde e antes de migration, alteração de ownership, deploy, remoção, rotação de secrets e início da janela de 48 horas.

## 8. Fluxo de engenharia e evidência

Cada entrega executa:

1. **Contract:** objetivo, boundaries, critérios, comandos, dependências e rollback;
2. **RED:** teste/guard demonstra o gap e separa regressão de baseline;
3. **GREEN:** menor implementação correta, testes focados e LSP/typecheck;
4. **Adversarial:** cross-workspace, null/empty, duplicidade, concorrência, retry, falha intermediária, data/timezone e indisponibilidade;
5. **Gate:** suíte do workspace, checks de contrato/boundary, revisão independente, `git diff --check`, checkpoint e evidência.

Cada entrega registra:

- commit ou checkpoint;
- comandos e exit codes;
- totais de testes e skips;
- riscos residuais;
- rollback;
- próxima entrega desbloqueada.

Outputs extensos ficam em artefatos duráveis. O transcript deve imprimir o resumo e as linhas necessárias para o avaliador do `/goal` verificar a conclusão.

## 9. Rubrica final

| Dimensão | Peso |
|---|---:|
| Pendências funcionais encerradas | 15 |
| API migration e boundaries | 15 |
| Segurança, authz e privacidade | 15 |
| Integridade, idempotência e concorrência | 15 |
| Testes e VAL.1–VAL.10 | 15 |
| Operação, observabilidade e rollback | 10 |
| Evidência e reprodutibilidade | 10 |
| Documentação e governança | 5 |
| **Total** | **100** |

### 9.1 Veredito

- **Aprovado:** ≥ 90/100 e nenhum veto;
- **Aprovado com ressalvas:** 80–89/100, mas o Goal Mestre permanece aberto;
- **Reprovado:** < 80/100 ou qualquer veto;
- **Ideal:** 100/100, sem arredondamento subjetivo.

### 9.2 Vetos

A nota não pode aprovar o projeto se existir:

- capability registrada sem API autenticada;
- SQL direto em boundary ativo;
- falha de isolamento entre workspaces;
- teste obrigatório falho ou skip incompatível;
- risco conhecido de perda ou duplicação de dados;
- secret exposto ou vulnerabilidade CRITICAL;
- rollback obrigatório não exercitado;
- dependência crítica do WhatsApp após G6;
- documento canônico contradizendo runtime;
- ação externa executada sem o consent gate correspondente.

### 9.3 Relatório final

O relatório apresenta score por dimensão, evidências e comandos, itens encerrados, riscos residuais, gates externos, estado de produção, rollback disponível e veredito justificado.

## 10. Condição de encerramento do Goal Mestre

O Goal Mestre encerra somente quando:

1. P0–P5 estão concluídas com evidência;
2. todos os 25 itens possuem resultado explícito;
3. todos os blockers atuais estão resolvidos, aceitos com autorização ou comprovadamente não aplicáveis;
4. VAL.1–VAL.10 estão verdes sem ocultar falhas;
5. a rubrica é ≥ 90/100;
6. nenhum veto permanece ativo;
7. ações externas respeitaram os gates de consentimento;
8. o relatório final e o contrato de rollback foram entregues.

## 11. Continuidade

Antes de pausa longa ou reinício:

1. criar checkpoint no `pi-tasks`;
2. atualizar `docs/goals/` com entrega atual, evidência, blocker e próximo comando `/goal`;
3. manter uma única entrega ativa;
4. reemitir a condição `/goal` da entrega ativa na sessão seguinte;
5. nunca inferir conclusão a partir de memória ou checkbox sem prova executada.
