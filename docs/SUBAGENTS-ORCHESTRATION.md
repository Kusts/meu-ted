# Sistema de Orquestração de Subagents

> Documento canônico sobre como este ambiente orquestra subagents.
> Cobertura: ferramenta nativa OpenCode `subagent` + paralelismo + skills de delegação + Orquestração Orca específica do projeto `pi-financeiro`.
> Idioma: pt-BR. Código/comandos em Inglês técnico.

Data: 2026-09-15. Fonte da verdade: comportamento observado das ferramentas + `AGENTS.md` + skills `orchestration`, `orca-cli`, `orca-team`, `dispatching-parallel-agents`, `subagent-driven-development`.

---

## 1. Visão geral — duas camadas

Existem **duas camadas distintas** de orquestração. Não misturar.

| # | Camada | Runtime | Quando usar |
|---|--------|---------|-------------|
| 1 | **OpenCode nativo** (`default.subagent` + chamadas paralelas) | Sessão OpenCode atual | Exploração de codebase, pesquisa, tarefas multi-step paralelizáveis, delegação leve sem estado externo |
| 2 | **Orca externo** (`orca` CLI + skills `orchestration` / `orca-cli` / `orca-team`) | App Orca (terminais, worktrees, Runs, Tasks, Dispatches) | Coordenação com estado real: terminais persistentes, worktrees gerenciados, handoff integral, DAG de tasks, `worker_done`, decisão com gate |

Regra de ouro:

- Coordenação com estado Orca real → **sempre Orca**. Nunca substituir por `default.subagent`.
- Handoff integral (“hand off”, “handover”, “give this to another agent”, “another worktree”) sem supervisão/monitoramento/DAG → skill `orca-cli`, não `orchestration`.
- Supervisão, monitoramento, espera de resultado, DAG, `ask/reply` bloqueante, `worker_done`/escalação, coordinator loop → skill `orchestration`.
- Tarefa independente sem estado externo → `default.subagent`.

---

## 2. Camada 1 — OpenCode nativo

### 2.1 Ferramenta `default.subagent`

Spawna um agente filho em sessão filha.

Assinatura efetiva:

```json
{
  "agent": "explore | general",
  "description": "label curto 3-5 palavras",
  "prompt": "tarefa completa com contexto",
  "background": false,
  "sessionID": "ses_... (opcional, para continuar)"
}
```

Agentes disponíveis:

- **`explore`**: rápido, especializado em explorar codebase. Usar para achar arquivos por padrão (`src/components/**/*.tsx`), buscar keywords (ex. “API endpoints”), responder “como X funciona?”. Níveis de thoroughness: `quick` | `medium` | `very thorough`.
- **`general`**: generalista para pesquisa complexa e tarefas multi-step. Usar para executar múltiplas unidades de trabalho em paralelo.

Semântica:

- Nova chamada sem `sessionID` = nova sessão filha com contexto zerado. **Incluir todo contexto relevante no `prompt`**.
- Com `sessionID` = continua conversa específica do subagent anterior.
- Retorno inclui `sessionID` reutilizável.
- `background=false` (default): roda até completar e retorna resposta final.
- `background=true`: lança assíncrono e retorna imediatamente; o runtime notifica na conclusão. **Não fazer sleep/poll/check proativo.** Usar só para trabalho independente que pode rodar enquanto você continua em outro lugar.

### 2.2 Paralelismo nativo

Mecanismo: **emitir várias mensagens de tool call no mesmo turno**, uma por mensagem, quando não há dependência entre elas.

Regras:

1. Chamadas independentes → mesmo bloco, em paralelo. Ex.: dois `default.subagent` + três `default.read` + dois `default.grep` de uma vez.
2. Chamada dependente de output anterior → sequencial. Nunca usar placeholder ou adivinhar parâmetro faltante.
3. Para computação local simples (parse, estatística, template) preferir `default.shell` com `python3 -c`. Arquivo script só se for artefato reutilizável ou complexidade justificar.
4. Para operações de arquivo preferir ferramenta dedicada: `default.read` > `cat/head/tail`; `default.edit` > `sed/awk`; `default.write` > `heredoc/echo`. `default.shell` é para comandos de sistema reais.
5. `default.read` em diretório já mostra ocultos. Não revalidar com `ls -la`/`find` se já achou o arquivo.

Exemplo de fan-out correto (conceitual):

```text
turno 1 (paralelo):
  → subagent(explore, "achar auth API")
  → subagent(general, "mapear mutations financeiras")
  → read(docs/ARCHITECTURE-CURRENT.md)
```

```text
turno 2 (após resultados, sequencial):
  → subagent(general, "implementar X com contratos confirmados no turno 1")
```

### 2.3 Quando dividir em subagents nativos

Dividir quando a tarefa tem **workstreams independentes** (ex.: “investigar 3 áreas”, “documentar 4 componentes”). Lançar via `default.subagent`.

Não dividir: passos dependentes, edições sobrepostas no mesmo arquivo, inspeção simples.

Para economizar contexto em exploração grande com output volumoso mas subset útil pequeno: delegar a `subagent(explore)` e pedir síntese — técnica prevista no guia de `subagent`.

---

## 3. Camada 2 — Orca externo

### 3.1 Descoberta: stub vs guia versionado

As skills `orchestration` e `orca-cli` neste repo são **stubs de descoberta**, não guias de uso. O guia completo e versionado é servido pelo próprio binário `orca` e pode mudar entre releases. **Nunca adivinhar subcomandos/flags de memória ou de cópia cacheada.**

Fluxo obrigatório antes de qualquer comando Orca:

1. **Resolver o executável uma vez e reutilizar** (placeholder `ORCA` abaixo = executável resolvido; não criar variável shell chamada `ORCA`, não rodar literalmente `ORCA`):

   - Se env `ORCA_CLI_COMMAND` setada → usar seu valor (sessões WSL gerenciadas exportam isso).
   - Senão, se checkout dev expõe `ORCA_DEV_REPO_ROOT` → usar `orca-dev`.
   - Senão, em Linux fora de terminal gerenciado Orca → usar `orca-ide`. **Nunca `orca` puro ali** — normalmente resolve para o screen reader GNOME (`/usr/bin/orca`) e dispara fala na máquina do usuário.
   - Senão → usar `orca`.

   Se o executável escolhido falhar, **reportar o erro exato e parar**. Não fazer fallback silencioso para outro build.

2. **Carregar o guia versionado:**

   ```text
   ORCA skills get orchestration   # para coordenação
   ORCA skills get orca-cli        # para worktrees/terminais/handoff/browser
   ```

   Ler a saída integral antes de operar. Reutilizar enquanto versão/executável não mudar e conteúdo ainda estiver no contexto; recarregar se mudar ou se perder.

3. Confirmar app ativo com `ORCA status --json` (subir com `ORCA open --json` se preciso). Preferir `--json` em chamadas agent-driven.

Fallback só para binário antigo confirmado: se o binário **explicitamente** disser que `skills get` é comando desconhecido (outro erro qualquer não prova binário antigo — reportar em vez de adivinhar), usar bootstrap somente-leitura limitado:

```text
ORCA status --json
ORCA orchestration task-list --json
ORCA terminal list --json        # variante orchestration
# ou:
ORCA status --json
ORCA worktree ps --json
ORCA terminal list --json        # variante orca-cli
```

E avisar o usuário que atualizar o Orca restaura o guia via `skills get`. Além disso, perguntar ao usuário em vez de adivinhar.

### 3.2 `orchestration` vs `orca-cli` — roteamento

| Sinal | Skill autoridade |
|-------|------------------|
| Threaded messages, `ask/reply` bloqueante, criação/dispatch de task, espera `worker_done`/escalação, DAG, decision gate, coordinator loop, decompor trabalho entre agentes | `orchestration` |
| Worktree gerenciado, folder context, terminal (ler/esperar/enviar), repo, automation, comentário de worktree, browser embutido, handoff integral (“hand off”, “handoff”, “handover”, “give this to another agent”, “another worktree”) sem supervisão/DAG | `orca-cli` |
| Papéis Planner/Coder/Review/Advisor/Suporte, alocação, aceite | `orca-team` (define papéis; comandos continuam vindo de `orchestration` + `orca-cli`) |

Coordenação exige estado real do runtime Orca; nunca emular com `default.subagent`.

### 3.3 Protocolo Orca específico deste projeto (`AGENTS.md`)

Instâncias atuais (podem mudar — reconciliar via `terminal list` antes de assumir):

- **Supervisor / Planner**: Muse Spark via OpenCode.
- **Coder operacional**: worker no terminal designado (ex. histórico: Antigravity `agy`).
- **Run ativa**: identificada por ID `run_*` (ex. histórico `run_46965e431ba5`). Nunca adotar um Run só por estar ativo/recente; Run acompanha um objetivo.

Protocolo de execução:

1. Supervisor cria tarefas (`task-create`) e despacha para o terminal do Coder (`worker-start --terminal` — preferir `worker-start` quando aplicável ao mapeamento, conforme guia versionado).
2. Coder processa instruções, emite **heartbeats periódicos** e executa com transparência (ver §5 CLI Verbosity).
3. **Comunicação interativa**: NUNCA usar prompt interativo local síncrono desconectado (`AskUserQuestion`). Sempre `orca orchestration ask` ou escalação de bloqueio.
4. **Finalização**: `worker_done` com `--outcome succeeded|failed` + lista `--files-modified` + `--body` conciso de **exatamente 3 frases**. `worker_done` encerra um Dispatch, não o objetivo.

---

## 4. Skill `orca-team` — equipe adaptativa

Ativa na sessão até fim da sessão ou desativação explícita. Novos pedidos relacionados não exigem nova invocação. Modos pela mensagem atual:

- **Aguardar** (invocação sem objetivo): confirma mapeamento + ativação; **não** faz bootstrap, status, guia dinâmico, Run/Task/Dispatch, nem opera terminal.
- **Executar** (objetivo explícito): entende pedido, define trabalho verificável, depois ativa workers.
- **Retomar**: exige pedido explícito; histórico/handoff antigo sozinho não autoriza. Reconciliar Run indicado; ambíguo → esclarecer.

### 4.1 Papéis (papéis, não nomes fixos)

- **Planner** (terminal de invocação): único orquestrador, dono da entrega. Define critérios, estratégia, alocação; acompanha Tasks/Dispatches; resolve dependências; valida conclusão. Faz inspeções curtas para decidir/validar; **não implementa, corrige, refatora ou edita arquivos do projeto**. Delega código a Coders, documentação a Suporte ou Coder.
- **Coder**: investiga, implementa, corrige, testa dentro do escopo com autonomia. Reutiliza padrões/código/verificações existentes. Com múltiplos Coders, um (normalmente o principal) responde pela integração.
- **Review**: revisa entrega concreta (diff, critérios, testes, impactos). Acionar após implementação relevante e para risco de regressão/integração/contrato/dado/comportamento sensível. Cada achado: problema + impacto + evidência; separa bloqueio real de sugestão. Estilo fora de convenção não bloqueia. Não implementa correção; pode esclarecer risco específico antecipadamente.
- **Advisor**: sob demanda para decisão que afeta arquitetura/custo significativo, com alternativas plausíveis e consequências diferentes, difícil reversão, ou incerteza travando o plano. Devolve recomendação breve + evidências + consequências. Não aprova cada passo, não substitui Review.
- **Suporte**: pesquisa, documenta, orienta design/UI/UX, validações auxiliares. Recebe pergunta/artefato delimitado; devolve síntese/fontes/documentação atribuída. Produto fica com Coder; visual simples/pesquisa simples não exige Suporte automaticamente.

Planner decide por evidência, não votação. Autoria e Review independentes. Workers não coordenam agentes nem criam Tasks. Instrução direta posterior do usuário prevalece.

### 4.2 Recursos e eficiência (antes de delegar)

- Identificar instruções aplicáveis, estado do projeto, recursos já disponíveis (skills, MCPs, memória, docs, resultados do Run). Carregar skill pelo problema, ferramenta pela capacidade; sem varredura mecânica de catálogo.
- Resolver pela evidência direta e barata primeiro (código, teste, doc local); ampliar para memória/vault/doc oficial/web/equipe conforme a lacuna. Parar quando suficiente.
- Reaproveitar referências, artefatos, terminais, evidências válidas; encaminhar só contexto necessário/alterado. Repetir pesquisa/leitura/teste/revisão só por mudança relevante, invalidação ou lacuna.
- Não gerar documento, rodada de opinião, abstração ou melhoria sem contribuição ao pedido. Advisor/Suporte sob demanda, não etapa obrigatória.
- Em código não trivial, usar `hybrid-development` e técnicas necessárias; indicar skills por escopo (ex. `code-craftsman` quando trouxer valor), sem impor mesmo pacote a todos.

### 4.3 Contrato de delegação (Dispatch)

Worker não recebe esta skill nem histórico do Planner por padrão. Transmitir regras relevantes + referências no Dispatch, sem copiar conversa inteira. Campos proporcionais (omitir vazios):

```text
Papel e resultado esperado:
Escopo e limites (incluindo arquivos/estado sob responsabilidade):
Contexto já apurado / referências e instruções aplicáveis:
Critérios de aceite e verificação:
Autonomia e condições de escalonamento:
```

Worker conduz investigação/implementação/teste/correção **dentro do mesmo Dispatch** até resultado ou bloqueio real; falha de teste + nova tentativa interna não exige nova Task/aprovação. Sem ampliação de escopo nem retry sem hipótese/mudança justificada.

Escalar ao Planner em: mudança de escopo, conflito entre trabalhos, decisão que afeta outros agentes, requisito ausente, bloqueio não resolvível no escopo. Preservar evidências; avançar partes independentes se possível. Planner só consulta o usuário por requisito/preferência essencial, credencial, autorização ou ação exclusiva do usuário.

Devolução breve: resultado; arquivos/artefatos; verificações + evidências; pendências/riscos/decisão necessária. Seguir lifecycle/formato do guia Orca vigente; não encerrar só para relatar progresso.

### 4.4 Operação (autoridade de comandos)

`orca-team` define papéis/alocação/aceite. Autoridade de comandos/lifecycle/mensagens/reconciliação/terminais = guias versionados `orchestration` + `orca-cli`.

Sequência:

1. Próxima Task definida → confirmar status, contexto do projeto, autoridade de coordenador. Se o Planner tiver Dispatch de worker ativo, parar e informar incompatibilidade.
2. Localizar terminais designados sem acordá-los; confirmar IDs, identidade, modelo efetivo, propriedade. Não deduzir por título. Worker com Dispatch ativo = indisponível para nova atribuição/limpeza/interrupção; reconciliar antes de agir.
3. Criar/reutilizar Run (um por objetivo; §4.5). Criar Tasks e usar caminho supervisionado do guia (preferir `worker-start`). Confirmar terminal + Dispatch reais sem duplicar criação/prontidão da composição. Sem handshake/`READY`; em falha, reconciliar antes de repetir.
4. Iniciar trabalho independente antes de esperar; usar mecanismo de espera + processamento de mensagens do Orca, sem polling redundante.

### 4.5 Run / Task / Dispatch

- **Run**: acompanha um objetivo + Tasks + Dispatches. Criar na primeira Task do objetivo; reutilizar em ajustes relacionados. Outro Run só para objetivo realmente distinto, sem abandonar Dispatches ativos do anterior.
- **Task**: unidade verificável dentro do Run.
- **Dispatch**: atribuição de Task (ou parte) a um worker/terminal específico.

Continuidade: manter registro curto (skill ativa; objetivo + Run; mapeamento + IDs; Dispatches pendentes; propriedade de temporários; decisões + refs de evidência; próxima ação). Atualizar só ao mudar. Após compactação/perda de contexto, restaurar registro e reconciliar com o Orca (fonte da coordenação); projeto/diff/testes/comportamento = fonte do resultado. Sem registro preservado, não inventar ativação/mapeamento/autoridade. Registro de sessão anterior não auto-ativa skill em nova sessão.

### 4.6 Alocação, paralelismo, integração

- Preservar mapeamento do usuário. Papel necessário ausente/ambíguo/indisponível → pedir só a decisão faltante; avançar no independente. Recurso só acumula papéis se o usuário definir; mudança de agente/modelo/atribuição exige orientação do usuário.
- Coders extras: **máx. 2 além do principal**, só para trabalho independente cujo ganho compense coordenação + integração. Replicar agente + modelo efetivo do Coder designado (comprovados no ambiente); se impossível, usar o principal ou consultar o usuário. Nunca abrir agentes preventivos/ociosos.
- Delimitar arquivos/módulos/estado por worker, incluindo documentação. Antes de paralelizar, alinhar contratos compartilhados, I/O e dependências; arquivos distintos ≠ independência. Serializar colisões e decisões instáveis.
- Com múltiplos Coders, designar explicitamente um responsável por combinar entregas + verificar funcionamento conjunto. Ele não orquestra os outros: dependência/conflito volta ao Planner. Testes individuais não substituem verificação da entrega integrada; Review examina o estado combinado.
- Temporários: registrar cada terminal criado no Run. Após concluir + reconciliar seu Dispatch, reutilizar se houver próxima Task concreta e adequada; senão fechar + confirmar. Fechar só temporários do Run — nunca Planner, preexistentes ou de outro Run. Reconciliar propriedade/atividade duvidosa antes de agir.

Contexto: por padrão não limpar terminais. Antes de Dispatch, só em worker ocioso sem Dispatch ativo e com suporte confirmado: `/clear` para histórico concluído e irrelevante (após preservar resultados) **ou** `/compact` para contexto útil mas grande — nunca ambos, nunca no Planner. Aguardar prontidão e revalidar handle.

Timeout = checkpoint, não falha: checar liveness + Dispatch antes de intervir; sem duplicar trabalho ativo ou trocar worker só por dificuldade. Sem caminho razoável, relatar bloqueio + intervenção mínima. Pausa/cancelamento pelo protocolo vigente, preservando trabalho e liberando temporários com segurança.

### 4.7 Aceite e conclusão

- Supervisionar por Task/Dispatch coeso, não cada tentativa interna. Após implementação relevante → Review + testes proporcionais ao risco. Achado real volta ao Coder (nova atribuição pelo protocolo se Dispatch anterior terminou). Revalidar afetados + integração. Sugestão opcional não amplia escopo nem bloqueia aceite.
- Comparar pedido × critérios × resultado final × revisão × testes; evidência deve corresponder ao estado entregue. Faltando critério/evidência, continuar recuperação sem reduzir aceite. Tudo atendido → concluir sem polimento/verificação redundante.
- Antes de concluir: reconciliar Tasks/Dispatches, confirmar sem trabalho ativo/bloqueio obrigatório, encerrar temporários (§4.6). Relato curto + evidências + revisão (quando houver) + limitações reais. Tabela de critérios só em entrega complexa ou se solicitada.
- Planner responde pela entrega completa, não só pela coordenação.

---

## 5. Skills de técnica de delegação (método `hybrid-development`)

`hybrid-development` é o roteador único de método. Abaixo, duas técnicas opcionais sob ele. Usar quando delegação/paralelismo agrega; pular em trabalho solo rotineiro.

### 5.1 `dispatching-parallel-agents`

Paralelismo útil só quando custo de coordenação < benefício.

1. Confirmar que o runtime tem launch de agentes, coleta de resultado e isolamento adequado. Não inventar tool nem presumir subagents. Sem isso, executar sequencialmente no agente atual e dizer isso plainly.
2. Separar por inputs/outputs/ownership independentes. Task que precisa de interface/resultado não resolvido de outra deve esperar. Config compartilhada, artefato gerado, operação de índice, serviço e fixture de teste contam como estado compartilhado.
3. Cada worker recebe: objetivo limitado, critérios de aceite, contexto confirmado, arquivos/recursos permitidos, operações proibidas, evidência exigida, condições de escalação.
4. Um escritor por recurso. Coordenador não edita arquivo de worker concorrentemente. Serializar mutação compartilhada e transferência de ownership; isolamento não dispensa reconciliar conflito de integração.
5. Coletar diff/artefato real, comandos + outcomes, limitações, perguntas abertas. Em bloqueio, ajustar escopo ou executar sequencial em vez de repetir spawn.
6. Inspecionar cada entrega contra requisitos + contrato local de qualidade. Report de sucesso do worker é input, não prova.
7. Integrar deliberadamente, preservando mudanças preexistentes; coordenador roda checks relevantes no estado combinado (`verification-before-completion`).

Não forçar tamanho de time, papel revisor redundante, worktree novo ou approval entre tasks já autorizadas.

### 5.2 `subagent-driven-development`

Delegação opcional; coordenador mantém objetivo, decisões compartilhadas, integração e verificação final. Soma scheduling a `dispatching-parallel-agents`:

1. Ler plano estabelecido; mapear grafo de dependências + critérios. Não repetir discovery; nem todo passo precisa de worker próprio.
2. Despachar só unidades prontas. Dependente recebe contrato confirmado do pré-requisito completo, não interface adivinhada.
3. Comparar cada entrega ao critério do plano antes de marcar completo. Registrar blocked/partial/verified separadamente no progress record existente.
4. Replanear restantes quando integração mudar interface ou invalidar premissa. Não despachar downstream contra contrato stale.
5. Fechar plano só quando evidência integrada cobrir os critérios — não quando cada worker mandar “done”.

Bloqueio: esclarecer contexto, estreitar escopo ou assumir sequencialmente. Sem repetir dispatch idêntico indefinidamente; sem exigir approval entre tasks autorizadas. Preservar trabalho prévio; reportar critério não resolvido honestamente.

---

## 6. Regras transversais do projeto (valem para qualquer worker)

De `AGENTS.md` — incluir no Dispatch quando aplicável:

1. **CLI Verbosity**: explicar brevemente antes de cada comando/leitura/edição; resumir resultado/erro/impacto depois; sem sequência longa em silêncio.
2. **TDD RED→GREEN**: todo bugfix/refactor/feature começa com teste falhando que capture o comportamento desejado.
3. **Multitenant**: todo comando/roota/query valida e aplica `workspace_id` e/ou `household_id`.
4. **Idempotência**: mutação financeira exige e valida `Idempotency-Key` + idempotency records + concorrência.
5. **Commits**: Coder deixa working tree pronto para revisão do Planner/Supervisor. Commit direto só após aprovação + validação.
6. **Gates**: nada é “done” sem `pnpm docs:lint` + `pnpm typecheck` + `pnpm test` + `pnpm governance:check` verdes.
7. **Destrutivos proibidos sem diff prévio + autorização**: `git reset --hard`, `git clean -fd`, `git checkout -- .`.
8. **PWA ativa** = `apps/pwa` deste repo (Cloudflare). `../pi-finance-web` depreciado — nunca usar para auditoria/deploy/produção.
9. **Idioma**: pt-BR em resposta/docs; Inglês técnico em código/variável/função/comentário/commit.

---

## 7. Árvore de decisão rápida

```text
Precisa de terminal/worktree/handoff/DAG/worker_done/ask-bloqueante?
├─ SIM → Orca. Carregou `skills get orchestration` (e `orca-cli` se mexer em terminal/worktree)?
│   ├─ NÃO → resolver executável + carregar guia primeiro. Não adivinhar comando.
│   └─ SIM → orca-team para papéis; orchestration/orca-cli para comandos.
│       ├─ Handoff integral sem supervisão? → orca-cli.
│       └─ Supervisão/DAG/espera? → orchestration.
└─ NÃO → OpenCode nativo.
    ├─ Tarefa é exploração/pesquisa limitada? → subagent explore/general direto.
    ├─ Dá para paralelizar sem compartilhar estado? → fan-out em um turno.
    └─ Dependente de resultado anterior? → sequencial, passando contrato confirmado.
```

---

## 8. Anti-padrões

1. Adivinhar subcomando/flag Orca de memória.
2. Trocar executável Orca em silêncio após falha.
3. Usar `default.subagent` para emular coordenação Orca com estado.
4. `AskUserQuestion` local para bloqueio de worker (usar `orca orchestration ask`).
5. Handshake/`READY` manual, polling redundante, duplicar criação/prontidão da composição.
6. Paralelizar com estado compartilhado não serializado (mesmo arquivo, migration, fixture, serviço).
7. Aceitar “done” de worker como prova sem inspecionar diff + rodar checks combinados.
8. `worker_done` para encerrar objetivo (encerra só o Dispatch).
9. Limpar (`/clear`+`/compact`, ou no Planner) sem necessidade; fechar terminal preexistente/de outro Run.
10. Commit direto sem aprovação; `reset --hard`/`clean -fd` sem diff + autorização.

---

## 9. Referências

- `AGENTS.md` — § Orquestração Orca & Comunicação Inter-Agentes, § CLI Verbosity, § Regras de Engenharia.
- Skills: `orchestration` (stub + `ORCA skills get orchestration`), `orca-cli` (stub + `ORCA skills get orca-cli`), `orca-team`, `dispatching-parallel-agents`, `subagent-driven-development` (sob `hybrid-development`).
- Guias versionados Orca: fonte normativa de comandos, lifecycle, mensagens, reconciliação, terminais.
- Docs canônicos de arquitetura: `docs/PRODUCT.md`, `docs/ARCHITECTURE-CURRENT.md`, `docs/ARCHITECTURE-TARGET.md`, `docs/ROADMAP.md`, `docs/adr/`.
