# Recuperacao do Projeto: Produto, Arquitetura e Gates

**Data:** 2026-07-28
**Status:** baseline canonica aprovada no working tree; publicacao depende de commit; somente G0 autorizado
**Escopo:** monorepo inteiro
**Plano derivado:** `docs/superpowers/plans/2026-07-28-project-recovery-roadmap.html`
**Substitui como direcao ativa:** `2026-07-27-pwa-centralizado-workspaces-design.md`

> Specs anteriores permanecem como historico. Em conflito, este documento vence.
> Mudanca de direcao exige evidencia nova, impacto, alternativa e decisao registrada.

## 1. Decisao executiva

Projeto continua como aplicativo financeiro privado, mobile-first, com PWA como cliente
canonico. API Fastify torna-se unica autoridade de dominio. Postgres permanece fonte de dados.
Agent interpreta linguagem e chama API; nunca recebe acesso SQL nem escolhe escopo de seguranca.

Roadmap anterior comecava por multiusuario, workspaces e chat. Auditoria encontrou riscos que
bloqueiam essa ordem. Primeira entrega passa a ser estabilizacao: conter acesso anonimo, impedir
perda/duplicacao de dados, obter CI confiavel e formalizar schema real. Features voltam somente
depois desses gates.

WhatsApp permanece durante transicao, mas sera retirado apos paridade, adocao e rollback
comprovados. Remocao imediata esta proibida.

## 2. Produto aprovado

| Tema | Decisao |
|---|---|
| Publico | Usuarios convidados; sem cadastro publico |
| Superficie principal | PWA responsivo e instalavel |
| Captura conversacional | Chat no PWA |
| WhatsApp | Canal transitorio; retirada por gates |
| Espacos | Pessoal e compartilhado |
| Acesso | Usuario pode pertencer a um ou varios espacos, conforme convite/membership |
| Chat pessoal | Visivel somente ao membro do espaco pessoal |
| Chat compartilhado | Todos membros do mesmo espaco podem ler e escrever |
| UI versus tools | Paridade por capacidade util; nao uma tela por tool |
| Escrita offline | Bloqueada ate existir protocolo de replay seguro |
| Idioma/moeda | pt-BR e BRL |

## 3. Estado verificado em 2026-07-28

| Fato | Evidencia |
|---|---|
| Monorepo possui bridge, API e PWA | `pnpm-workspace.yaml`, `vitest.config.ts` |
| README declara apenas duas frentes | `README.md:3-15` |
| PWA fala somente com API | `apps/pwa/src/lib/api/client.ts:10-25` |
| WhatsApp fala com Pi RPC | `apps/whatsapp-bridge/src/pi-client-factory.ts:111-220` |
| Pi tools e API escrevem no mesmo dominio | `.pi/extensions/financial-tools/index.ts`, `apps/api/src/` |
| API registra 58 rotas; 54 financeiras | `apps/api/src/routes/` |
| API usa device token, sem usuario/membership | `apps/api/src/routes/auth.ts`, `apps/api/src/auth/device-token.ts` |
| Producao documentada usa adapters legacy | `apps/api/src/server/index.ts`, `docs/ESTADO-E-PROXIMOS-PASSOS.md` |
| PWA usa snapshot IndexedDB | `apps/pwa/src/lib/state/` |
| Fase 0.1 centralizou auth E2E | `apps/pwa/e2e/support/harness.ts` |
| Agent Cloudflare, workspaces e Web Push nao existem | ausencia de `apps/agent`; busca no codigo |

Topologia de producao nao foi validada por SSH nesta auditoria. Documentacao indica API,
Postgres, Evolution e bridge na VPS; PWA em Cloudflare Workers.

## 4. Baseline executada

`DATABASE_URL` estava ausente. Nenhum teste acessou Postgres ou VPS.

| Gate | Resultado |
|---|---|
| API typecheck | passou |
| API tests | falhou: 7/249; 241 passaram; 1 ignorado |
| Bridge tests | passou: 408/408 |
| Bridge typecheck | falhou por config/tipos duplicados e dependencias |
| PWA TypeScript completo | falhou com dezenas de erros em testes e scripts |
| PWA lint | falhou: ESLint 10 incompatível com `eslint-plugin-react` |
| Next production build | passou |
| OpenNext Cloudflare build | falhou em Windows com `EBUSY` em `.open-next/assets` |
| PWA tests | falhou: 2/1007; 1005 passaram |

Conclusao: quantidade de testes e alta, mas branch nao possui baseline verde reproduzivel.

## 5. Bloqueadores de release

| ID | Severidade | Achado | Gate |
|---|---|---|---|
| SEC-01 | CRITICAL | `POST /auth/devices/register` entrega token do household default sem autenticacao | Cadastro publico impossivel |
| DATA-01 | CRITICAL | Suites Postgres executam `TRUNCATE ... CASCADE` para qualquer `DATABASE_URL` | Banco descartavel e guard obrigatorio |
| DATA-02 | CRITICAL | Idempotencia faz check, efeito e registro em etapas/conexoes distintas | Claim e efeito atomicos |
| AGT-01 | CRITICAL | Um cliente Pi compartilhado ignora telefone/contexto e pode misturar chats concorrentes | Serializacao/isolamento enquanto ativo |
| AUTH-01 | HIGH | Auth repetida por handler, sem gate que proteja rota nova | Pre-handler unico e teste enumerador |
| AUTH-02 | HIGH | Updates/referencias legacy permitem casos cross-household | Ownership em query e constraint |
| DATA-03 | HIGH | Operacoes compostas nao sao atomicas | Unit of Work por comando financeiro |
| PWA-01 | HIGH | Mutators podem absorver erro e fechar formulario como sucesso | Falha relancada e draft preservado |
| PWA-02 | HIGH | Agregados usam no maximo 200 transacoes | Agregados server-side/paginacao |
| PWA-03 | HIGH | Writes nao enviam idempotency key nem reconciliam estado | Chave persistente e refetch canonico |
| OPS-01 | HIGH | CI cobre PWA, nao API/bridge/schema/Docker | CI monorepo obrigatorio |
| OPS-02 | HIGH | App sempre roda migrations; `MIGRATIONS_MODE` e ignorado | Migration job separado |

Qualquer `CRITICAL` aberto bloqueia deploy. `HIGH` que afete auth, isolamento ou integridade
financeira bloqueia abertura para novo usuario.

## 6. Arquitetura alvo

```text
PWA (Cloudflare Worker)
├─ UI financeira
├─ chat pessoal/compartilhado
├─ snapshot local somente leitura
└─ sessao do usuario
        |
        +--> Agent Worker / AIChatAgent
        |    ├─ autoriza membership antes de resolver Durable Object
        |    ├─ 1 conversa por workspace
        |    ├─ tools HTTP tipadas
        |    └─ sem SQL, sem token privilegiado, sem regra financeira
        |
        +--> API Fastify (VPS)
             ├─ autentica usuario
             ├─ resolve membership + workspace
             ├─ executa dominio e idempotencia atomica
             ├─ registra auditoria
             └─ acessa schema de producao versionado

WhatsApp (transitorio)
└─ adapter autenticado --> mesma API --> Postgres
```

Regras de fronteira:

1. Somente API executa regra financeira e SQL de dominio.
2. Cliente nunca fornece identidade confiavel, role ou household sem validacao de membership.
3. Worker autoriza conexao antes de resolver DO; API autoriza cada request novamente.
4. Modelo recebe tools escopadas; nunca recebe credencial, `userId` ou `workspaceId` alteravel.
5. Postgres e fonte de verdade para operacoes, pendencias e auditoria; DO e fonte do transcript.
6. Cada side effect possui idempotency key, actor, workspace e audit record.
7. Cliente envia `X-Workspace-Id` como selector nao confiavel; pre-handler resolve membership e
   handlers recebem somente `AuthenticatedContext`.

## 7. Decisoes tecnicas travadas

| ID | Decisao | Motivo | Rejeitado |
|---|---|---|---|
| D01 | Estabilizacao antes de feature | Riscos atuais permitem acesso e corrupcao | Iniciar workspaces/chat agora |
| D02 | API como unica autoridade de dominio | Remove divergencia Pi/API/PWA | Agent ou PWA com SQL/regra duplicada |
| D03 | Schema real de producao vira baseline; legacy e candidato ate fingerprint read-only | Decide por evidencia sem manter tres schemas | Assumir docs ou schema ideal |
| D04 | Migrations fora do startup | Deploy e rollback controlaveis | Auto-migration no processo web |
| D05 | PWA permanece cliente canonico | Produto e testes ja investidos | Novo frontend |
| D06 | Invite-only, sem auth propria artesanal | Menor superficie de abuso | Signup publico e JWT caseiro |
| D07 | Gate de auth: Access se provar fluxo inteiro; **Better Auth selecionado após G4.1.1** | Criterio estavel sem apostar em integracao nao provada | Escolha por preferencia |
| D08 | `households` e entidade fisica de workspace | Evita tabela paralela e migracao sem valor | Renomear todas colunas/tabelas |
| D09 | Membership e autoridade de acesso | Suporta pessoal/compartilhado | Workspace confiado por header |
| D10 | Um DO por workspace apos authz | Pessoal e compartilhado usam mesmo modelo | DO resolvido direto por URL do cliente |
| D11 | Token delegado curto e escopado no Agent | Limita prompt injection | Service token privilegiado |
| D12 | Tools do Agent sao clientes HTTP tipados | Regra unica na API | Portar SQL das 72 tools |
| D13 | Pendencia/aprovacao canonica no Postgres | Visivel fora do chat e transacional | Estado exclusivo em `needsApproval` |
| D14 | Idempotencia obrigatoria e atomica | Retry nao pode duplicar dinheiro | Header opcional + check-then-write |
| D15 | Leitura offline; escrita offline adiada | Replay atual nao e seguro | Outbox antes da idempotencia |
| D16 | WhatsApp sai por canary e soak | Preserva captura e rollback | Big-bang |
| D17 | Paridade por capacidade observavel | Evita uma tela por helper/tool | Paridade por nome de arquivo |
| D18 | Node 22 + pnpm 10.34.1 em local, CI e containers | Reprodutibilidade | Matriz acidental Node 20/22 |
| D19 | Implementacao usa Stateless Goal Loop (`/goal`) por unidade verificavel | Testes/build fornecem termino objetivo e baixo custo | Loop de score como executor principal ou um goal para programa inteiro |

### 7.1 Gate de autenticacao

Cloudflare Access somente seria escolhido se o spike provasse, em PWA instalada e browser:

1. login e logout utilizaveis;
2. JWT validado por `iss`, `aud`, assinatura, expiracao e JWKS rotativo;
3. identidade do usuario preservada em browser -> Worker -> API;
4. WebSocket do Agent autenticado antes do DO;
5. revogacao e troca de usuario sem estado residual;
6. nenhum service token substituir identidade humana.

O spike G4.1.1 falhou nos critérios de JWT, identidade e WebSocket, e não provou revogação sem estado residual nem ausência de service token na integração. Conforme D07, **Better Auth self-hosted na API foi selecionado como fallback canônico**. A decisão está registrada em `docs/adr/002-better-auth-fallback-after-access-spike.md`; um agente futuro não pode reabrir a lista de provedores sem evidência nova.

Better Auth deve provar matriz equivalente antes de producao: cookie/sessao segura,
CSRF, logout e revogacao server-side, entrega de convite, normalizacao de email, usuario existente,
race de aceite e bloqueio quando email autenticado difere do convite. A implementação permanece
self-hosted em `apps/api`, sem signup público e sem service token como identidade humana.

### 7.2 Contrato de idempotencia

Chave fisica: `(workspace_id, actor_id, operation, idempotency_key)`. Registro contem versao de
canonicalizacao, SHA-256 do payload canonico, `claimed | completed | failed`, lease, response e
timestamps. Claim, efeito financeiro, auditoria e conclusao usam mesma transacao/connection.

Retry com payload divergente retorna conflito. Claim abandonado so pode ser recuperado apos lease
de cinco minutos e reconciliacao do efeito. `IDEMPOTENCY_RETENTION_DAYS` inicia em 90; retry
automatico ou manual suportado nao pode exceder sete dias. Remocao ocorre por job, nunca durante
request. Regeneracao do Agent reutiliza ID persistido da intencao, nao novo tool call.

### 7.3 Politica de aprovacao inicial

Approval persistente aplica-se a side effects propostos pelo Agent:

| Operacao | Criterio inicial | Quem solicita | Quem aprova |
|---|---|---|---|
| Criar/alterar gasto, renda, transferencia, compra ou pagamento | valor >= R$ 500 configuravel por workspace | membro ativo | mesmo actor que originou mensagem |
| Excluir/cancelar dado financeiro | qualquer valor | membro ativo | mesmo actor que originou mensagem |
| Operacao administrativa de workspace | qualquer | owner | mesmo owner; transferencia de ownership exige owner destino aceitar |

Outro membro pode ver pendencia compartilhada, mas nao aprovar em nome do requester. Owner pode
cancelar pendencia compartilhada. API aplica regra; Agent apenas apresenta. Multi-aprovacao fica
fora de escopo ate existir requisito.

### 7.4 Token delegado do Agent

Token interno possui `iss`, `aud`, `sub`, `workspace_id`, `role`, `capabilities`, `jti`,
`request_id`, `iat` e `exp` de no maximo cinco minutos. API valida assinatura, audience, expiry,
capability e membership atual. Token e emitido por turno, nao persistido no DO, nao enviado ao
modelo e nao aceito em workspace diferente.

### 7.5 Transicao do WhatsApp

Sequencia unica, sem shadows concorrentes:

1. Bridge continua dona da resposta; Pi interpreta texto, mas tools passam a chamar API.
2. Novo Agent recebe copia read-only e mede divergencia sem responder nem executar side effect.
3. Apos canary PWA, bridge envia WhatsApp ao novo Agent; telefone e mapeado server-side para
   usuario/workspace permitido; Agent vira dono da resposta e Pi fica fallback read-only.
4. Writes Pi sao desabilitadas, fallback e removido apos soak, depois Evolution/bridge saem.

Cada estado possui feature flag, uma fonte de resposta e rollback documentado. Nunca Pi e Agent
executam tools para mesma mensagem.

### 7.6 Inventarios dinamicos

CI gera inventario a partir do registry Fastify e de `registerTool`. Cada rota/tool nova precisa
de classification ID no mesmo PR. Contagens 58/72 sao fotografia da auditoria, nao limite fixo.
Capability possui ID, persona, frequencia, risco, API, superficie `UI | chat | internal | retire`,
criterio observavel e aprovacao humana quando nao houver UI.

## 8. Modelo de dados alvo

```sql
users (
  id uuid primary key,
  email text unique not null,
  name text not null,
  status text not null,
  created_at timestamptz not null
)

households (
  id uuid primary key,
  name text not null,
  kind text not null check (kind in ('personal', 'shared')),
  created_at timestamptz not null
)

memberships (
  user_id uuid not null references users(id),
  household_id uuid not null references households(id),
  role text not null check (role in ('owner', 'member')),
  status text not null,
  primary key (user_id, household_id)
)

invites (
  id uuid primary key,
  household_id uuid not null references households(id),
  email text not null,
  role text not null,
  token_hash text unique not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  invited_by uuid not null references users(id)
)
```

Sessao pertence ao provedor aprovado. Token persistido pela aplicacao deve ser hash, expiravel,
rotacionavel e revogavel. `household_id` continua nome fisico nas tabelas financeiras.

Invariantes:

- usuario possui no maximo um workspace pessoal; criacao e opcional no onboarding;
- workspace pessoal possui exatamente um owner ativo, nao aceita convite e nao muda para shared;
- workspace compartilhado possui ao menos um owner; ultimo owner nao pode sair sem transferir ou
  excluir workspace;
- novo membro compartilhado ve historico anterior; remocao encerra acesso imediatamente;
- logout, revogacao ou remocao fecham sockets ativos e invalidam reconnect/delegated tokens;
- pending/audit anterior a usuarios usa `actor_type = device | user` e `actor_id`; migracao futura
  preserva proveniencia em vez de inventar `user_id`.

Transcript: retencao padrao de 180 dias, export e exclusao disponiveis, payloads brutos de tools e
tokens nao persistidos, leitura auditada e provider de LLM configurado sem treino sobre dados do
produto. Owner pode limpar chat compartilhado com aviso e audit record.

## 9. Requisitos EARS

### Seguranca e isolamento

- **REQ-001:** When request reaches protected route, API shall authenticate user before handler.
- **REQ-002:** When workspace is selected, API shall verify active membership before data access.
- **REQ-003:** If membership is absent, then API and Agent shall return forbidden without data.
- **REQ-004:** When Agent connection starts, Worker shall authorize membership before resolving DO.
- **REQ-005:** The system shall never expose privileged credential or mutable scope to model.
- **REQ-006:** When invite is accepted, system shall consume it once and create membership atomically.
- **REQ-007:** If environment is production and required security config is absent, startup shall fail.

### Integridade financeira

- **REQ-010:** When financial command is submitted, client shall send stable idempotency key.
- **REQ-011:** When key is claimed, API shall execute effect, audit and completion in one transaction.
- **REQ-012:** If same key has different canonical payload, then API shall reject conflict.
- **REQ-013:** When compound operation fails, API shall rollback every related mutation.
- **REQ-014:** When resource ID is used, store shall scope lookup/update by household.
- **REQ-015:** When high-impact operation is proposed, API shall persist pending operation before approval.
- **REQ-016:** When pending operation is approved, API shall consume and execute it atomically once.
- **REQ-017:** If idempotency claim lease expires, then API shall reconcile prior effect before retry.

### Produto e chat

- **REQ-020:** While workspace is personal, only its member shall read or write chat history.
- **REQ-021:** While workspace is shared, active members shall read and write shared chat history.
- **REQ-022:** When Agent invokes capability, tool shall call authenticated API endpoint.
- **REQ-023:** If user cancels chat turn, then Agent shall propagate abort signal to model call.
- **REQ-024:** When capability has useful non-chat workflow, PWA shall expose suitable UI.
- **REQ-025:** Where capability is internal interpretation, system may omit dedicated UI.
- **REQ-026:** When membership/session is revoked, system shall terminate active chat connection.

### Operacao

- **REQ-030:** The repository shall provide one green command set for lint, typecheck, test and build.
- **REQ-031:** When code changes any workspace, CI shall run relevant required gates.
- **REQ-032:** If database URL is not explicitly disposable, then destructive test shall refuse startup.
- **REQ-033:** When migration is released, migration job shall verify checksum and acquire advisory lock.
- **REQ-034:** While WhatsApp is transitional, it shall use same API contracts and scoped identity.
- **REQ-035:** When decommission gates pass, system shall disable Pi writes before removing fallback.
- **REQ-036:** When route or tool is registered, CI shall require capability/security classification.
- **REQ-037:** While transition shadow runs, exactly one runtime shall own response and side effects.
- **REQ-038:** When implementation starts, executor shall use one bounded `/goal` with failing acceptance test and explicit termination commands.
- **REQ-039:** If `/goal` repeats same failure twice, exceeds six continuations, needs production access or reaches subjective acceptance, then executor shall stop and report evidence.

## 10. Gates de fase

| Gate | Condicao de saida |
|---|---|
| G0 Contencao | Todos CRITICAL fechados; migrations fora do startup; DB destrutivo prova marker server-side; governanca canonica publicada |
| G1 Baseline | CI monorepo verde; comandos locais reproduziveis; build Cloudflare em Linux |
| G2 Integridade | Operacoes compostas atomicas; IDOR e ownership cobertos; schema real versionado |
| G3 PWA correta | Erros preservam draft; estado reconcilia; agregados completos; contrato real testado |
| G4 Identidade | Convites, usuarios, memberships e authz 100% das rotas |
| G5 Agent canary | Chat autenticado, tools HTTP, approvals e custo observavel; writes em canary |
| G6 Decommission | Paridade aceita, push/reminder estaveis, adocao medida, rollback testado |

## 11. Fora de escopo

- Mover API para Cloudflare Workers.
- Microservices, Kubernetes, event sourcing ou GraphQL.
- Role `viewer` sem caso real.
- Signup publico, billing, multi-idioma ou temas.
- Escrita offline antes do protocolo idempotente de replay.
- Uma tela para cada tool interna.
- Renomear `household_id` no banco.

## 12. Politica contra mudanca arbitraria

Qualquer alteracao de D01-D19 exige ADR com:

1. fato novo verificavel;
2. decisao afetada;
3. alternativas comparadas;
4. impacto em seguranca, dados, prazo e rollback;
5. aprovacao humana quando mudar produto;
6. atualizacao desta spec e do plano no mesmo commit.

Descoberta tecnica pode reordenar tarefa dentro de uma fase, mas nao mudar objetivo, fronteira ou
gate silenciosamente.

## 13. Referencias

- Cloudflare AIChatAgent: <https://developers.cloudflare.com/agents/communication-channels/chat/chat-agents/>
- Cloudflare HITL: <https://developers.cloudflare.com/agents/concepts/agentic-patterns/human-in-the-loop/>
- Cloudflare Access JWT: <https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/>
- Auditoria anterior: `docs/ESTADO-E-PROXIMOS-PASSOS.md`
- Spec substituida: `docs/superpowers/specs/2026-07-27-pwa-centralizado-workspaces-design.md`
