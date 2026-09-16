# Plano de execução — Meu TED V4: Hardening, Simplificação e Descomissionamento

**Goal:** Implementar a SPEC [`MEU-TED-SPEC-HARDENING-SIMPLIFICACAO-E-DESCOMISSIONAMENTO-V4.md`](../../MEU-TED-SPEC-HARDENING-SIMPLIFICACAO-E-DESCOMISSIONAMENTO-V4.md) por blocos A–K, endurecendo as bordas da arquitetura V3 sem reconstruir o núcleo: microfone funcional em browser real (header + capability testados juntos); sessão normal sem bearer reutilizável em localStorage (cookie-first com migração gradual); device tokens com hash em repouso e lifecycle completo (`V053`); política offline explícita (`maxOfflineAge`); Undo com atomicidade **provada por injeção de crash** em PostgreSQL real; WorkspaceAgent descomissionado após prova de 0 dependências; produção sem exceções de desenvolvimento; CSP reforçando a topologia same-origin; Cross-Layer Invariant Tests (XLT-01..10) como nova categoria permanente; documentação e gates refletindo o runtime real. Nenhuma fase altera a divisão de autoridade PWA → FinanceChatAgent/API → PostgreSQL (SPEC §5, INV-01..INV-10).

**Status:** PLANEJADO (rev. 3 — aplica REV-V4-2: B4 reescrito com `offlineSubjectId` = id do workspace/household ativo; T0.2 sem teste vermelho permanente, RED de ARCH-V4-06a confinado à Fase 4; Bloco J obrigatório para fechamento (P3 ≠ opcional); nova T0.4 de observabilidade (SPEC §24); T2.5 decisão de transporte deferida ao ADR-015 sem pré-decisão (Opções A/B/C); ARCH-V4-06a/b substituem XLT-06a/b; baselines explícitas produção × planejamento; matriz de rastreabilidade reconstruída incluindo §24/§27/D-V4; débitos de fechamento restritos. **Patch pós-revisão (mesma rev.3):** T0.4.1 mede uso efetivo do fallback bearer em request (`auth.request.legacy_bearer_used`); §8.B3/T2.2 alinhados ao cookie Better-Auth já existente; CSP com produtor real — Opção A, endpoint same-origin `POST /api/csp-report` (T0.4.8/T2.7); histórico REV-V4-1 superado marcado na SPEC) — aguardando autorização de execução.

**Baselines explícitas (REV-V4-2):**

- **Production Code Baseline — `3305152`:** código V3 efetivamente implantado (API `v3-3305152` na VPS com migration `V052`; PWA `a5ff2b4a`; Agent `0e557bba`). Toda comparação de comportamento de produção usa este SHA.
- **Repository/Planning Baseline — `5733cc8`:** HEAD do repositório usado para planejar a V4 (documentação pós-deploy; não representa novo deploy funcional). A branch de execução é criada a partir do HEAD **vigente no início da execução**.

**Regra de revalidação:** se o HEAD tiver avançado quando a execução começar, NÃO usar `5733cc8` cegamente — revalidar os gates de entrada (T0.1) sobre o novo HEAD e registrar o novo SHA de planejamento antes de criar a branch.

Reauditoria (REV-V4-1): 3 subagentes read-only confirmaram as afirmações da SPEC com evidência `arquivo:linha` (SPEC §31.1) e produziram 7 correções de escopo (SPEC §31.2). REV-V4-2 acrescentou evidência de identidade/telemetria e corrigiu B4 (SPEC §31.4). Nenhuma alteração na divisão de autoridade PWA → proxy same-origin → FinanceChatAgent/API → PostgreSQL.

## Evidência de baseline (reauditoria REV-V4-1)

| Achado | Estado na baseline | Evidência |
|---|---|---|
| `Permissions-Policy: microphone=()` com botão de gravação sempre renderizado | Ativo | `apps/pwa/src/proxy-utils.ts:18`; `apps/pwa/src/features/ted/TedChat.tsx:764-771`; contrato travado por `apps/pwa/src/__tests__/proxy.test.ts:39-41` |
| 2 bearers reutilizáveis em localStorage (`session-token`, `token`) | Ativo | `apps/pwa/src/lib/api/client.ts:73-91`; `apps/pwa/src/lib/auth/token-store.ts:9-53`; gravação em `AuthGate.tsx:68-87` e `convite/page.tsx:183-194` |
| PWA chama API direta por env fixa no deploy (divergência ADR-011) | Ativo | `apps/pwa/wrangler.jsonc:29`; `client.ts:52-61` prioriza env sobre proxy `/api/backend` |
| Device token plaintext, sem hash/lifecycle; SQL tautológico (4 pontos) | Ativo | `V001__init.sql:84-90`; `device-token.ts:57,63-64,71`; `payables/postgres.ts:580,595`; sem `last_used_at`/`expires_at` |
| Sem política de idade de sessão offline | Ativo | `snapshot-db.ts:207-230` não checa idade; `lastOnlineAuthenticatedAt` inexistente |
| WorkspaceAgent legado com binding `AGENT`, rota `/agents/workspace/*` e sync de histórico | Ativo | `wrangler.jsonc:9,14-15`; `worker.ts:251,280-317`; `worker.ts:41`; PWA: `agent-client.ts:330,335` |
| Undo Postgres já atômico; in-memory não; sem prova por crash | Parcial | `writes/postgres.ts:873,939-948` (same-tx); `writes/idempotency.ts:139-140` (sem tx) |
| Proxy PWA aceita/spoofa Origin local sem gate de ambiente | Ativo | `api/backend/[...path]/route.ts:39-43,47-57,66-71`; `api/agent/[...path]/route.ts:41-45` |
| CSP permite saída direta do browser para API/Agent | Ativo | `proxy-utils.ts:52-55` |
| `.pi/AGENTS.md` contradiz arquitetura; check-legacy não cobre WorkspaceAgent | Ativo | `.pi/AGENTS.md:1-5,173-176`; `scripts/check-legacy-runtime-references.mjs:8-14` |
| `lint` = alias de `tsc` na API; agent/broker sem lint | Ativo | `apps/api/package.json:9,18`; biome instalado não invocado |
| CI remoto bloqueado (billing GitHub Actions) — deploy manual wrangler | Externo | `AGENTS.md` (Working Tree); registrado, não é falha de código |

## Regras de execução

1. Branch dedicada `feat/meu-ted-v4-hardening` a partir do **HEAD de planejamento vigente** (baseline de planejamento: `5733cc8` — revalidar conforme regra acima antes de criar a branch); nenhum deploy automático durante o desenvolvimento.
2. TDD real: RED observado → menor GREEN coerente → refactor seguro. Nenhum teste alterado para passar artificialmente. Extração do Bloco K exige RED correspondente. **Nenhum RED conhecido atravessa fases (REV-V4-2): RED local da tarefa → GREEN na mesma unidade lógica de trabalho → branch volta a ficar verde.**
3. Migrations novas aditivas e backward-compatible a partir de `V053` (padrão `VNNN__snake.sql`); nunca reescrever migrations aplicadas; política de migration da V3 (processo dedicado + advisory lock + marcador de backup) permanece.
4. `apps/api` permanece a única autoridade financeira; Agent e PWA continuam sem escrita direta (INV-01). Nenhuma tarefa pode enfraquecer hash, attestation, bindings ou idempotência existentes (INV-03).
5. Rollout em slices reversíveis na ordem da SPEC §22; compatibilidade só é removida após prova de migração dos consumidores. Cada bloco tem rollback independente (SPEC §23).
6. Mudanças em fronteiras de segurança (B, C, D, G, F) exigem reviewer independente; auth/Pending/Undo/autorização exigem security-reviewer dedicado (SPEC §21).
7. Gates contínuos por fase: `pnpm docs:lint`, `pnpm typecheck`, `pnpm test`, `pnpm governance:check`, `pnpm security:check`.
8. Política de prioridade × obrigatoriedade (REV-V4-2): Bloco A é P1 e bloqueante; B–I seguem o sequenciamento §20 e são obrigatórios; **Bloco J é P3 em prioridade e OBRIGATÓRIO para o fechamento (VAL-V4.2) — prioridade menor ≠ opcional**; **Bloco K é o único não bloqueante**. CI remoto segue bloqueado por billing — gates locais valem, bloqueio registrado, e re-execução no mesmo SHA fica como débito explícito (SPEC §19).
9. Nenhum secret em código, logs ou relatórios; telemetria da SPEC §24 observa contagens, nunca valores de credenciais.

## Fase 0 — Baseline, instrumentação XLT e governança

### T0.1 — Registro de baseline e gates de entrada

- **Objetivo:** fotografar o estado antes de qualquer mudança: SHA de planejamento vigente (baseline: `5733cc8`, revalidado na execução — ver Baselines), resultado dos gates locais, SHAs de produção (Production Code Baseline `3305152`: API/PWA/Agent), migration atual `V052`, deployment ids Cloudflare. Base do deploy gate H3/H4.
- **Arquivos prováveis:** `docs/reports/meu-ted-v4-implementation-report.md` (novo, esqueleto).
- **RED primeiro:** não se aplica (registro).
- **Mudança esperada:** nenhum código; só evidência.
- **Risco:** drift entre registro e realidade — capturar por execução, não por leitura.
- **Aceite:** gates de entrada verdes ou divergências registradas como débito.
- **Validação:** `pnpm docs:lint && pnpm typecheck && pnpm test && pnpm governance:check`.
- **Dependência:** primeira tarefa.
- **Responsável:** Tester.

### T0.2 — Infraestrutura da categoria Cross-Layer Invariant Tests

- **Objetivo:** criar a categoria XLT (SPEC §18) com convenção de naming (`xlt-NN`), localização por camada (E2E PWA para cenários browser; testes de integração da API para cenários Postgres; testes de config para cenários de ambiente) e documentação da categoria — **somente infraestrutura** (REV-V4-2: nenhum teste deliberadamente vermelho nasce aqui; os checks estáticos do descomissionamento são ARCH-V4-06a/b e nascem em T4.1).
- **Arquivos prováveis:** `apps/pwa/e2e/xlt/` (novo), `apps/api/tests/xlt/` (novo), `docs/testing/xlt-category.md` (novo).
- **RED primeiro:** nenhum RED permanente nesta tarefa. Um XLT de fumaça atravessando 2 camadas reais (ex.: config de produção → header efetivamente emitido) nasce e fica verde na própria tarefa.
- **Mudança esperada:** harness + convenção; testes individuais nascem em cada bloco, cada um com RED→GREEN local.
- **Risco:** XLT virar suíte unitária disfarçada — cada XLT deve atravessar ≥ 2 camadas reais, senão não entra na categoria.
- **Aceite:** categoria documentada e executável pelos runners dos workspaces; **branch 100% verde ao fim da tarefa**.
- **Validação:** suites dos workspaces afetados.
- **Dependência:** paralela a T0.1; pré-requisito de todos os blocos.
- **Responsável:** Tester + Coder.

### T0.3 — ADRs e governança documental

- **Objetivo:** registrar as decisões materiais da V4 antes do código: ADR-015 (hardening de sessão: cookie-first **a partir do cookie Better-Auth já emitido hoje** — `better-auth.ts:50-58`, passthrough `better-auth-http.ts:125-130`; **decisão de transporte do device token**, avaliando Opção A (cookie HttpOnly dedicado → proxy → header interno), Opção B (header aleatório temporário com prazo explícito) e Opção C (convergência session-first: a resolução central já autentica por sessão + `X-Workspace-Id` antes do fallback de device token — `routes/index.ts:210-261` — dispensando o device token nas chamadas normais), com critérios XSS/CSRF/proxy same-origin/lifecycle/rotação/revogação/escopo/offline/migração/compatibilidade/logout/simplicidade operacional; política offline com `offlineSubjectId` (SPEC §8.B4, D-V4-11) e `maxOfflineAge`) e ADR-016 (descomissionamento do WorkspaceAgent: inventário, prova de 0 dependências, rollback de DO); atualizar índice `docs/adr/README.md`; linha V4 em `docs/ROADMAP.md` (o registro em `scripts/lint-docs.mjs` já foi efetivado no planejamento — REV-V4-2).
- **Arquivos prováveis:** `docs/adr/ADR-015-session-hardening.md` (novo), `docs/adr/ADR-016-workspace-agent-decommissioning.md` (novo), `docs/adr/README.md`, `docs/ROADMAP.md`, `scripts/lint-docs.mjs:64-75`.
- **RED primeiro:** `governance:check`/`docs:lint` não se aplica (docs); validação é revisão + gates.
- **Mudança esperada:** decisões D-V4-05..D-V4-09 com consequências técnicas (formato do cookie, janela de coexistência, gatilhos de remoção).
- **Risco:** ADR duplicando a SPEC — ADR registra decisão e consequência, SPEC permanece o quê/porquê.
- **Aceite:** ADRs indexados; novos docs lintáveis.
- **Validação:** `pnpm docs:lint`, `pnpm governance:check`.
- **Dependência:** paralela a T0.1/T0.2; desbloqueia Fases 1–4 (e é pré-requisito da decisão de T2.5).
- **Responsável:** Planner + Coder.

### T0.4 — Contrato e instrumentação de observabilidade V4 (SPEC §24)

- **Objetivo:** garantir por contrato que as 8 perguntas da SPEC §24 tenham resposta ao fim da V4, **sem plataforma nova** — reutilizando mecanismos existentes (evidência REV-V4-2): `audit_logs` canônico com `event_type` indexado por `workspace_id, created_at` (`apps/api/src/read-models/sql/V013__operation_records_audit.sql:6-38`; escrita `writes/postgres.ts:949-963`; leitura `audit/store.ts:122-148`, rota `routes/audit.ts:72-89`), `adoption_events` (`V026`), `operation_records`, access-log do DO do Agent (`apps/agent/src/schema.ts:88-96`; `apps/agent/src/index.ts:250-305`), logger estruturado do Fastify (`apps/api/src/server/index.ts:70,162-176`) e precedente de métricas de shadow (`routes/shadow-observability.ts:62-151`).
- **Arquivos prováveis:** convenção de nomes canônicos de `event_type` em `apps/api/src/audit/` (novo módulo leve), emissores pontuais nos fluxos das tarefas de cada bloco, contadores client-side leves na PWA reportados no próximo ciclo autenticado (sem beacon/serviço novo), consulta via `GET /audit-logs` existente + seção dedicada no relatório V4.
- **RED primeiro:** teste de contrato de privacidade — o serializador/validador de eventos falha se qualquer payload contiver `password`, bearer, device token raw, cookie raw, attestation ou payload financeiro completo (SPEC §24).
- **Mudança esperada:** a tabela abaixo vira contrato; cada emissor nasce junto com o fluxo correspondente (T1.1, T2.2, T2.4, T2.6, T2.7, T3.1, T4.1) e esta tarefa verifica a cobertura final.
- **Risco:** métrica virar infraestrutura nova — proibido; qualquer mecanismo fora da lista exige justificativa explícita na tarefa.

**Contrato de métricas (SPEC §24):**

| # | Pergunta | Evento/métrica | Produtor | Dimensões mínimas | Consumo | Nascimento | Remoção |
|---|---|---|---|---|---|---|---|
| 1 | requests ainda autenticadas via fallback bearer legado | `auth.request.legacy_bearer_used` (counter) — emitido **somente** quando o cookie/session não autenticou a request **e** o bearer legado foi o autenticador efetivo do fallback; não conta header presente, tentativa nem login | API (caminho central de resolução de autenticação) | workspace_id | `GET /audit-logs` + relatório V4 | T2.2 | fechamento da janela B3 |
| 2 | device tokens antigos ativos | contagem de `device_tokens` sem hash (flag legacy/vintage), logada periodicamente | API (rotação/job) | counts por vintage | log estruturado + relatório V4 | T2.4 | pós-rotação completa |
| 3 | workspaces dependentes do WorkspaceAgent | eventos do access-log do DO (`history_export`, stream) | Agent DO | workspace_id | `GET /history/access-log` existente | T4.1 (baseline) | fechamento de E4 |
| 4 | sessões offline > `maxOfflineAge` | evento client `offline.locked` (report autenticado) | PWA (T2.6) | `offlineSubjectId`, faixa de idade | adoption/audit + relatório V4 | T2.6 | decisão futura de biometria (§10.D4) |
| 5 | undos que são replay | counter `audit-undo:replay` (idempotency store já distingue replay) | API | workspace_id | relatório V4 | T3.1 | permanente (barato) |
| 6 | operações em reconcile | counter no caminho do MutationReconciler | API | operationId, motivo | relatório V4 | T3.1 | permanente |
| 7 | erros de permissão/gravação de microfone | evento client `mic.error` (reason code: denied/notfound/busy) | PWA (T1.1/T1.2) | capability on/off, reason code | adoption/audit + relatório V4 | T1.1 | estabilidade pós-V4 |
| 8 | tentativas de contornar o proxy same-origin | `csp.violation` com **produtor real** (Opção A do patch): CSP `report-to`/`report-uri` → endpoint same-origin `POST /api/csp-report` — payload mínimo (effectiveDirective, host do `blockedURL` **sem query**, disposition, statusCode), sanitização sem credenciais, bounded logging com sampling, sem plataforma nova; complemento: counter no proxy para origens rejeitadas | PWA (header CSP + endpoint) | directive, host bloqueado, capability | log estruturado (Workers) + relatório V4 | T2.7 | estabilidade pós-V4 |

- **Aceite:** tabela implementada sem novo serviço; teste de privacidade verde; relatório V4 com consulta de exemplo para cada métrica.
- **Validação:** suites API/PWA afetadas + `pnpm typecheck`.
- **Dependência:** T0.2 (convenção de testes); emissores individuais dependem das tarefas dos blocos correspondentes.
- **Responsável:** Coder; reviewer.

## Fase 1 — BLOCO A (P1, bloqueante): microfone funcional

### T1.1 — Capability flag de microfone + Permissions-Policy condicional + UI gated

- **Objetivo:** `Permissions-Policy` reflete a capability declarada nos dois sentidos: mic enabled → `microphone=(self)`; disabled → `microphone=()` **com a UI de gravação oculta/desabilitada pela mesma capability** (SPEC §7.A1/A2, INV-08, D-V4-08). Camera/geolocation permanecem bloqueadas. Bloco A existe para o mic funcionar em produção — o deploy da Fase 1 configura a flag como `true`.
- **Arquivos prováveis:** `apps/pwa/src/lib/capabilities.ts` (nova flag `NEXT_PUBLIC_TED_MICROPHONE`, default false, leitura em call-time — padrão do gotcha `NEXT_PUBLIC_*`), `apps/pwa/src/proxy-utils.ts:13-20` (`buildPermissionsPolicy(flag)`), `apps/pwa/src/middleware.ts:37-59` (injeção), `apps/pwa/src/features/ted/TedChat.tsx:127,764-771` (botão mic gated por `caps.microphone`, fora do render quando off), `apps/pwa/wrangler.jsonc:27-31` (flag `true` no deploy da Fase 1), `apps/pwa/src/__tests__/proxy.test.ts:39-41` (atualizar contrato).
- **RED primeiro:** teste de contrato capability↔header falha: flag on → header atual nega; flag off → header permite (inversão impossível hoje). Teste de UI: flag off → botão mic ausente/desabilitado (hoje é incondicional — INV-08 violado na direção oposta). Teste adicional: nenhum origin externo recebe permissão de mic.
- **Mudança esperada:** header deixa de ser constante e passa a ser função da capability; `SECURITY_HEADERS` fica base, policy completa por resposta; UI e header nunca divergem (ambos leem a mesma flag).
- **Risco:** habilitar mic globalmente por engano — flag default false em código, `true` explícito só no deploy da Fase 1; policy nunca emite `(self)` para origins cruzados.
- **Aceite:** relação capability↔header testada nos dois sentidos; UI↔capability testada nos dois sentidos; deploy da Fase 1 com gravação funcional (A4).
- **Validação:** `pnpm --filter pwa test` + T1.2.
- **Dependência:** T0.2 (convenção de teste); desbloqueia T1.2.
- **Responsável:** Coder; reviewer depois.

### T1.2 — E2E real de gravação (XLT-01)

- **Objetivo:** Playwright com mídia fake provando idle → requesting → recording → stop → attachment gerado; e permission denied → error sem gravação fantasma (SPEC §7.A3/A4, XLT-01, VAL-V4.15).
- **Arquivos prováveis:** `apps/pwa/e2e/xlt/ted-microphone.spec.ts` (novo); launch args `--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`; fluxo existente `use-recording-state.ts:8-10,121-130`.
- **RED primeiro:** com a flag on e a policy corrigida, o E2E ainda falha se qualquer camada contradisser (header do build, gate de UI, lifecycle).
- **Mudança esperada:** nenhum código de produção além de T1.1, salvo defeitos que o E2E revelar.
- **Risco:** E2E verde só local — validar com a política HTTP do build Cloudflare (`apps/pwa/src/headers.test.ts:5` → `.open-next/assets/_headers`); executar contra build, não só dev server (R3).
- **Aceite:** gravação funciona em Chromium real com headers do build; denied path sem estado `recording` residual.
- **Validação:** E2E PWA + build; critério de aceite A4.
- **Dependência:** T1.1.
- **Responsável:** Coder + Tester.
- **Deploy:** Fase 1 pode ir a produção independentemente (SPEC §20); smoke após deploy.

## Fase 2 — Segurança da sessão (B → C → D → G)

### T2.1 — Convergir tráfego da PWA para o proxy same-origin (pré-requisito do B)

- **Objetivo:** browser→backend passa a fluir por `/api/backend` e `/api/agent` em produção; as URLs diretas deixam de ser o caminho publicado para **API e Agent** (SPEC §13.G1, §5, ADR-011). Sem isso, cookie HttpOnly não chega na API (cross-site) e o B1 é impossível; e o `connect-src 'self'` da T2.7 bloquearia o chat do TED se a env direta do Agent permanecer.
- **Arquivos prováveis:** `apps/pwa/wrangler.jsonc:29-30` (remover `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL` **e** `NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL` do deploy), `apps/pwa/src/lib/api/client.ts:41,52-61` (proxy como default; env vira escape hatch dev), `apps/pwa/src/lib/api/agent-client.ts:62-69` (idem agent).
- **RED primeiro:** teste de configuração falha enquanto o deploy publicado aponta URL direta de API **ou** Agent; teste de client falha enquanto `baseUrl()`/`agentBaseUrl()` priorizam env sobre proxy em produção.
- **Mudança esperada:** deploy passa a usar os proxies; origens externas saem do `connect-src` na T2.7.
- **Risco:** regressão de CORS/cookie no proxy — o proxy já faz passthrough de `set-cookie` e valida Origin (`api/backend/[...path]/route.ts:25-44,119-124`); smoke obrigatório pós-deploy incluindo chat/history do TED via `/api/agent`.
- **Aceite:** smoke de produção autentica via proxy **e** conversa TED funciona end-to-end via proxy do Agent; CSP ainda mantém as origens externas até T2.7 (transição, não big-bang).
- **Validação:** PWA tests + smoke read-only.
- **Dependência:** T0.2; desbloqueia T2.2.
- **Responsável:** Coder; reviewer + smoke.

### T2.2 — Cookie-first: transporte validado e preferência (B3 passos 1–3)

- **Objetivo:** sessão normal opera via cookie HttpOnly já emitido pela API (Better-Auth `better-auth.ts:50-58`; passthrough `better-auth-http.ts:125-130`) — a tarefa remove a **necessidade** do fallback bearer, não cria emissão; client para de **precisar** do bearer do localStorage; `credentials: include` (já presente) assume o transporte (SPEC §8.B1/B2, D-V4-05). No login, a PWA passa a persistir o `offlineSubjectId` (id do workspace/household ativo — SPEC §8.B4, D-V4-11) recebido do contexto autenticado.
- **Arquivos prováveis:** `apps/pwa/src/features/auth/AuthGate.tsx:68-87` e `apps/pwa/src/app/convite/page.tsx:183-194` (parametrizar gravação sob flag de compat), `apps/pwa/src/lib/auth/token-store.ts` (única abstração, telemetria de uso), `apps/pwa/src/lib/api/client.ts:141-154` (anexar Authorization só quando o token legado existir), persistência do `offlineSubjectId` junto ao contexto de workspace.
- **RED primeiro:** login sem permissão de escrita em localStorage autentica e opera 100% via cookie; com token legado presente, requisições ainda funcionam (coexistência); `offlineSubjectId` persistido é opaco e não derivado de credencial.
- **Mudança esperada:** escrita de `pi-finance:session-token`/`pi-finance:token` fica atrás de flag de compatibilidade com data de remoção (janela ADR-011, review 2026-12-01), telemetria de **uso efetivo** do fallback (T0.4.1 — `auth.request.legacy_bearer_used`, emitida somente quando o bearer autentica a request na ausência de cookie válido; SPEC §24).
- **Risco:** quebrar fluxo do convite — cobrir os 3 writes da página de convite nos testes; associação offline durante a migração — snapshots antigos keyados por `ownerFingerprint` (hash do device token) perdem o re-matching quando a credencial sai; a repartição por `offlineSubjectId` acontece em T2.3.
- **Aceite:** XLT-02 verde (login → cookie → proxy → API autenticada, sem bearer novo em localStorage); `offlineSubjectId` persistido e não-credencial.
- **Validação:** PWA tests + E2E auth.
- **Dependência:** T2.1; desbloqueia T2.3.
- **Responsável:** Coder; **security-reviewer** (fronteira de auth).

### T2.3 — Cookie-first: remoção gradual do localStorage (B3 passos 4–7)

- **Objetivo:** medir uso efetivo do fallback bearer legado (T0.4.1) → remover leitura → remover escrita → remover fallback server-side (B3 passos 4–7). A remoção só ocorre após a telemetria de **uso efetivo do fallback** demonstrar uso abaixo do limiar de remoção definido no ADR-015 e a janela vencida/decidida — login ou header presente não contam como uso.
- **Arquivos prováveis:** `client.ts:73-91` (leitura), `token-store.ts` (escrita), `AuthGate.tsx`/`convite/page.tsx` (últimas escritas), `apps/pwa/src/lib/state/snapshot-db.ts` (repartição por `offlineSubjectId` + migração de envelopes v2), limpeza de chaves legadas no bootstrap (caminho de limpeza do B2).
- **RED primeiro:** após remoção da leitura, requisição com token órfão em localStorage não o utiliza; limpeza no bootstrap apaga as duas chaves; snapshot abre pela partição `offlineSubjectId` mesmo sem nenhuma credencial em localStorage.
- **Mudança esperada:** critério B5 — em produção, nenhum token capaz de autenticar sessão normal em localStorage; snapshots v2 migram da chave de credencial (`ownerFingerprint`, hash do device token) para `offlineSubjectId`.
- **Risco:** usuários com sessão legada ativa no meio da janela — migração por re-login silencioso aceitável; snapshots antigos keyados por fingerprint são invalidados e re-sincronizados no próximo online (cache re-sincronizável, zero perda de dado financeiro).
- **Aceite:** XLT-02 endurecido (nenhuma leitura de credencial em localStorage no caminho de requisição); B4 verificado por teste: snapshot particionado por `offlineSubjectId` opaco não-credencial, nunca por credencial (SPEC §8.B4).
- **Validação:** PWA tests + E2E.
- **Dependência:** T2.2 + telemetria.
- **Responsável:** Coder; security-reviewer.

### T2.4 — Device token: migration V053, hash e lifecycle (C1–C3, C6)

- **Objetivo:** token aleatório (sem householdId no segredo), `token_hash` em repouso (SHA-256, padrão de invites `invites-postgres.ts:65`), lifecycle `name/user_id/last_used_at/expires_at`, coexistência antigo/novo sem logout global (SPEC §9). O binding de `user_id` exige estender o contrato atual (`registerDeviceToken(deviceName, householdId)` em `apps/api/src/auth/device-token.ts:7-10,62-65`) e propagar `session.userId` na rota (`apps/api/src/routes/auth.ts:51-60,96-99`) — tokens legados ficam com `user_id` nulo durante a coexistência.
- **Arquivos prováveis:** `apps/api/src/read-models/sql/V053__device_token_hardening.sql` (novo, aditivo), `apps/api/src/auth/device-token.ts:7-10,50-71` (contrato + lookup/revoke parametrizados + hash na verificação), `apps/api/src/routes/auth.ts:51-60,96-99` (propagar `userId`), `apps/api/src/auth/invites.ts` (padrão de hash), callers do registro nos testes.
- **RED primeiro:** leak de DB não autentica (XLT-10): linha do banco sozinha não produz header válido; token novo é rejeitado se registrado com householdId no segredo (C1); queries sem escopo falham em teste adversarial.
- **Mudança esperada:** registro passa a gravar hash + metadados; lookup compara hash; tokens antigos aceitos durante a janela (coluna `legacy`/`expires_at` preenchido na migração).
- **Risco:** R4 (rotação força logout) — janela de coexistência obrigatória; migration validate-only no processo web (política V3).
- **Aceite:** XLT-10 verde; tokens antigos continuam autenticando durante a janela; `V053` aplicada por job dedicado com backup.
- **Validação:** `pnpm --filter pi-finance-api test` + job Postgres.
- **Dependência:** T0.3 (ADR-015); paralela a T2.2/T2.3 (superfícies distintas).
- **Responsável:** Coder; **security-reviewer** + database review.

### T2.5 — Device token: rotação e transporte do client (C4)

- **Objetivo:** rotação com transição controlada (novo token → janela → revogação do anterior). **O transporte final do device token será decidido no ADR-015 (T0.3) — esta tarefa não presume a escolha (REV-V4-2).** O ADR avalia, com a evidência de que o device token hoje é load-bearing em toda chamada de dados (`client.ts:141-154`; resolução central com fallback em `routes/index.ts:210-261`; boot gate `AuthGate.tsx:34` → `/auth/devices/me`): **Opção A** — cookie HttpOnly dedicado → PWA same-origin proxy → header interno apropriado para a API; **Opção B** — header/token aleatório temporário durante a migração, com prazo explícito de remoção; **Opção C** — convergência session-first: a resolução central já autentica por sessão + `X-Workspace-Id` antes do fallback (`routes/index.ts:219-237`), dispensando o device token nas chamadas normais, que permanece apenas para usos escopados (registro, verificação, context-token) com hash + lifecycle. Critérios: XSS exposure, CSRF, same-origin proxy, lifecycle, rotação, revogação, escopo usuário/household, offline, migração, compatibilidade, logout, simplicidade operacional.
- **Arquivos prováveis:** `apps/api/src/auth/device-token.ts` (endpoint de rotação) +, conforme a opção aprovada: proxy `api/backend/[...path]/route.ts:25-44` (injeção cookie→header — Opção A), `token-store.ts`/`convite/page.tsx` (prazo explícito — Opção B) ou `client.ts` (remoção do header de chamadas normais — Opção C).
- **RED primeiro:** dois tokens válidos na janela; após revogação, só o novo autentica; nunca dois eternamente (teste de TTL da janela). Independente da opção de transporte.
- **Mudança esperada:** dependente da decisão do ADR-015 **aprovado**; em nenhuma opção o device token permanece secret eterno em JS.
- **Risco:** INV-04 — qualquer transporte não autoriza mutação sem validação server-side (proxy só transporta; API valida escopo).
- **Aceite:** rotação sem logout; escopo household explícito em toda query (C5 concluído junto: `device-token.ts:57,71` + `payables/postgres.ts:580,595` parametrizados); decisão do ADR-015 registrada e implementada conforme aprovado.
- **Validação:** API tests + adversarial.
- **Dependência:** T2.4 + ADR-015 aprovado (T0.3).
- **Responsável:** Coder; security-reviewer.

### T2.6 — Política offline: maxOfflineAge (D1–D3)

- **Objetivo:** `lastOnlineAuthenticatedAt` persistido + `MAX_OFFLINE_AUTH_AGE` configurável; snapshot expirado → `offline session locked` com revalidação online; escritas offline continuam proibidas (SPEC §10, D-V4-06). Partição do snapshot por `offlineSubjectId` (§8.B4) e lock herdado pelo offline shell — hoje `public/offline-shell.js:28-44` renderiza o snapshot **sem** checagem de ownership/idade (achado REV-V4-2).
- **Arquivos prováveis:** `apps/pwa/src/lib/state/snapshot-db.ts:207-230` (checagem de idade + partição `offlineSubjectId` na leitura), `apps/pwa/src/lib/session.ts` (carimbo no login/refresh), `apps/pwa/public/offline-shell.js:28-44` (herdar `offlineSubjectId` + lock de idade), novo estado de UI locked em `app-state-context.tsx:487-547`, env em `apps/pwa/src/lib/capabilities.ts` (call-time).
- **RED primeiro:** XLT-08 — sessão offline com idade > limite não exibe snapshot financeiro (nem via offline shell); dentro do limite exibe; revalidação online desbloqueia; write offline segue bloqueado (`OfflineWriteError`).
- **Mudança esperada:** envelope/meta do snapshot ganha `lastOnlineAuthenticatedAt` e partição por `offlineSubjectId` (não por credencial — SPEC §8.B4); `readV2Snapshot` e o offline shell fail-closed.
- **Risco:** lock falso por relógio local — tolerância configurável e registrada no ADR-015; nunca elevar autoridade (INV-06).
- **Aceite:** XLT-08 verde incluindo o shell; logout continua limpando snapshot (`session.ts:87-90`) — XLT-09.
- **Validação:** PWA tests + E2E offline.
- **Dependência:** T0.3 (ADR-015) e T2.2 (`offlineSubjectId` persistido); independente de T2.3–T2.5.
- **Responsável:** Coder; reviewer.

### T2.7 — Hardening de borda: proxies, localhost e CSP (G1–G4)

- **Objetivo:** (a) gate de ambiente para exceções locais nos proxies Next — spoof/aceitação de localhost só fora de produção (SPEC §13.G3); (b) `connect-src 'self'` em produção após T2.1 provar o fluxo via proxy (G1); (c) diretivas adicionais quando compatíveis (`default-src`, `object-src`, `form-action`; `base-uri`/`frame-ancestors` já presentes); (d) testes por ambiente (G4); (e) **relatório real de violação CSP (Opção A)**: `report-to`/`report-uri` apontando para endpoint same-origin `POST /api/csp-report` (payload mínimo: effectiveDirective, host do `blockedURL` sem query, disposition, statusCode; sanitização sem credenciais; bounded logging com sampling; sem plataforma nova) — visibilidade da transição de CSP e mitigação operacional de R3.
- **Arquivos prováveis:** `api/backend/[...path]/route.ts:39-71` e `api/agent/[...path]/route.ts:41-73` (gate `NODE_ENV`/env explícita), `proxy-utils.ts:47-69` (CSP por ambiente + diretiva report-to), `proxy-utils.ts:56-58` (localhost dev já gated), `apps/pwa/src/middleware.ts`, `apps/pwa/src/app/api/csp-report/route.ts` (novo endpoint same-origin).
- **RED primeiro:** XLT-03 (production config rejeita localhost no proxy) e XLT-04 (development permite) falham na baseline — o spoof hoje roda sem gate; XLT-05 (browser não alcança origin proibido sob CSP de produção) falha enquanto `connect-src` lista origens externas.
- **Mudança esperada:** exceções locais exigem env explícita de dev/teste; CSP de produção reflete a topologia same-origin; qualquer origem externa remanescente documentada por capability (G1).
- **Risco:** R3 (CSP quebra OpenNext/Cloudflare) — aplicar primeiro em preview/teste e validar o **build final** (`headers.test.ts` + deploy de teste), nunca só código-fonte; rollback por configuração.
- **Aceite:** XLT-03/04/05 verdes; build Cloudflare validado com CSP nova; **violações CSP recebidas via `POST /api/csp-report` e consultáveis no log estruturado/relatório V4** (payload sanitizado, sem credenciais, bounded); nenhum fluxo legítimo bloqueado.
- **Validação:** PWA tests + build + smoke de produção.
- **Dependência:** T2.1 (proxy padrão em produção); pode rodar em paralelo com T2.4–T2.6 (arquivos distintos).
- **Responsável:** Coder; **security-reviewer**.

## Fase 3 — Consistência financeira: Undo provado (F)

### T3.1 — Suíte compartilhada de undo com injeção de crash (XLT-07)

- **Objetivo:** provar a atomicidade do undo contra PostgreSQL real: crash nos 5 pontos (antes da reversão, durante, após reversão, antes do commit de idempotência, após commit) → 0 ou 1 efeito financeiro e replay convergente (SPEC §12.F2/F4, D-V4-07).
- **Arquivos prováveis:** `apps/api/tests/xlt/undo-crash.test.ts` (novo), harness do job Postgres (padrão T0.3 da V3), `apps/api/src/approvals/undo.ts:85,108`, `apps/api/src/writes/postgres.ts:873,939-948`.
- **RED primeiro:** a suíte que assera at-most-one efeito sob crash demonstra o que a leitura de código só sugere; qualquer divergência falha.
- **Mudança esperada:** preferencialmente **nenhuma** mudança no caminho Postgres (já same-tx, REV-V4-1 F-1); defeitos revelados pela suíte são corrigidos dentro da transação existente (F3 opção 1).
- **Risco:** R5 (acoplamento) — reusar `withTransaction` existente; proibido distributed transaction.
- **Aceite:** XLT-07 verde em Postgres real; VAL-V4.7 coberto.
- **Validação:** `pnpm --filter pi-finance-api test` + job Postgres.
- **Dependência:** T0.2; pode rodar em paralelo com a Fase 2 (arquivos distintos).
- **Responsável:** Tester; revisão por database-engineer.

### T3.2 — Paridade in-memory do idempotency store

- **Objetivo:** eliminar a divergência documentada (in-memory persiste após o producer sem fronteira — `idempotency.ts:139-140`): alinhar ordenação/semântica do store in-memory com a suíte compartilhada. O path legado de `operation_records` (`postgres.ts:874-909`) **não** serve ao undo — resolvido em REV-V4-2 (SPEC §31.3.2): é o branch `DB_SCHEMA=legacy` do store, inalcançado pelo undo canônico (`approvals/undo.ts:83-85`); registrar essa conclusão na suíte (teste cobre os dois branches do store).
- **Arquivos prováveis:** `apps/api/src/writes/idempotency.ts:139-140`, suíte compartilhada de T3.1.
- **RED primeiro:** divergência in-memory vs Postgres na suíte compartilhada falha na baseline.
- **Mudança esperada:** in-memory documenta/alinha semântica (dev/teste — sem promessa de atomicidade de processo, mas replay convergente); suíte cobre canônico e legacy branch.
- **Risco:** super-engenharia do store de dev — paridade de **comportamento observável**, não de implementação.
- **Aceite:** suíte compartilhada verde nos dois stores; conclusão sobre o branch legacy registrada na suíte.
- **Validação:** API tests.
- **Dependência:** T3.1.
- **Responsável:** Coder + Tester.

## Fase 4 — Descomissionamento (E + I)

### T4.1 — Arquitetura anti-regressão (E3, ARCH-V4-06)

- **Objetivo:** estender `check-legacy-runtime-references.mjs` com patterns `WorkspaceAgent`, `/agents/workspace/`, `env.AGENT` (allowlist temporária de migração versionada, com data de expiração); checks reclassificados como **architecture checks** (REV-V4-2 — não são XLT): **ARCH-V4-06a** (consumidores externos = 0: nenhum caller fora de `apps/agent` referencia rotas/símbolos legados — pré-condição da remoção) e **ARCH-V4-06b** (referências estáticas proibidas = 0 em todo o repo, com allowlist vazia/expirada — pós-condição da remoção). Ambos integrados a VAL-V4.9 via gate executável (`run-final-validation.mjs` ou job de CI), não chamada manual. Registrar também a baseline de dependência via access-log do DO (T0.4.3).
- **Arquivos prováveis:** `scripts/check-legacy-runtime-references.mjs:8-27` (novas categorias + allowlist expirável), `scripts/run-final-validation.mjs` (integração do guard).
- **RED primeiro (confinado à Fase 4):** ARCH-V4-06a nasce vermelho AQUI e vira verde na T4.2, dentro desta mesma fase (REV-V4-2: nenhum vermelho conhecido atravessa fases). O anti-regressão do guard (reprovar import novo fora da allowlist; allowlist expirada reprova o gate) nasce e fica verde nesta tarefa.
- **Mudança esperada:** nenhuma remoção ainda; only guard, executável por comando de validação.
- **Risco:** allowlist eterna — allowlist com data e dono; gate reprova quando expira.
- **Aceite:** guard ativo **e** executado pelo gate de validação; vermelho apenas no estado intermediário documentado desta fase (ARCH-06a pendente de T4.2).
- **Validação:** comando de validação integrado + script isolado.
- **Dependência:** T0.2; precede toda remoção.
- **Responsável:** Coder.

### T4.2 — Migração histórica e prova de 0 consumidores (E2)

- **Objetivo:** import de histórico idempotente (`exportFullWorkspaceHistory` → `importLegacyHistory`), relatório de workspaces ainda dependentes, remoção dos callers legados da PWA (`agent-client.ts:330,335` → rotas canônicas `/rpc/history`), prova de que nenhum tráfego novo precisa do WorkspaceAgent. Gate de saída: **ARCH-V4-06a** (consumidores externos = 0) — as referências estáticas internas ao `apps/agent` só chegam a zero na T4.3.
- **Arquivos prováveis:** `apps/agent/src/worker.ts:41`, `apps/agent/src/finance-chat-agent.ts:1464`, `apps/pwa/src/lib/api/agent-client.ts:330,335,607`, relatório em `docs/reports/`.
- **RED primeiro:** PWA sem os helpers legados falha se algum fluxo ainda depender; re-import de histórico não duplica mensagens (idempotência).
- **Mudança esperada:** dependências de consumidor caem para 0 (ARCH-V4-06a verde) **antes** de qualquer remoção.
- **Risco:** R2 (perda de histórico) — export/import idempotente + relatório de cobertura por workspace.
- **Aceite:** ARCH-V4-06a = 0 (branch volta a ficar verde nesta tarefa); relatório de dependências zeradas publicado.
- **Validação:** Agent + PWA tests; dry-run do import.
- **Dependência:** T4.1.
- **Responsável:** Coder; reviewer.

### T4.3 — Remoção do WorkspaceAgent (E4) com rollback planejado (E5)

- **Objetivo:** com consumidores externos = 0 (ARCH-V4-06a): remover rota `/agents/workspace/*`, `syncLegacyHistory`, export do WorkspaceAgent, binding `AGENT`, `LegacyAgentStub`, testes de compatibilidade substituídos; atualizar `agent-scaffold.test.ts:12-21` (invariante muda para single-runtime); allowlist da T4.1 expira e **ARCH-V4-06b** (referências estáticas proibidas = 0 em todo o repo) passa a valer como pós-condição; **não** remover migration tags DO sem confirmar regras da Cloudflare (E5).
- **Arquivos prováveis:** `apps/agent/src/worker.ts:8,12,41,55,251,280-317,327`, `apps/agent/src/index.ts:44-55,144-222,452,610`, `apps/agent/wrangler.jsonc:9`, `apps/agent/migrations/`, `apps/agent/tests/`.
- **RED primeiro:** após remoção, o guard com allowlist vazia falha se qualquer referência estática remanescente reaparecer; ARCH-V4-06b = 0 no gate de validação.
- **Mudança esperada:** INV-07 — FinanceChatAgent único runtime.
- **Risco:** rollback de DO com estado persistente — plano de rollback documentado **antes** da remoção do binding (ADR-016); deployment progressivo Cloudflare.
- **Aceite:** deploy sem as rotas legadas; ARCH-V4-06b verde; **XLT-06** (SPEC §18, REV-V4-2) verde contra o runtime publicado — PWA → rota canônica → histórico/conversa funcionais com `/agents/workspace/*` ausente e sem fallback involuntário; smoke read-only verde; nenhum erro de histórico em produção por 48h (observação).
- **Validação:** Agent tests + build + XLT-06 + smoke + observação pós-deploy.
- **Dependência:** T4.2 + autorização explícita de deploy.
- **Responsável:** Coder; **security-reviewer** + architect para rollback.

### T4.4 — Limpeza documental (I1–I5)

- **Objetivo:** arquivar `.pi/AGENTS.md` e instruções legadas em `docs/archive/legacy-pi/` com header `STATUS: ARCHIVED`; auditar `.pi/prompts`+`.pi/skills` residual; corrigir wording de `apps/api/.env.example:7`; teste semântico documental (I5) garantindo que docs canônicos não contradigam: API = autoridade financeira, FinanceChatAgent = runtime ativo, WhatsApp bridge removido, Pi tools removidas, PostgreSQL = persistência de produção.
- **Arquivos prováveis:** `.pi/AGENTS.md` → `docs/archive/legacy-pi/`, `docs/archive/` (convenção existente), `apps/api/.env.example:7`, `scripts/canonical-docs-contract.test.mjs` (estender) ou novo check.
- **RED primeiro:** I5 falha enquanto `.pi/AGENTS.md` (nome ativo) contradiz a arquitetura; falha se doc canônico citar runtime removido como ativo.
- **Mudança esperada:** nenhum AGENTS.md aninhado contradiz a arquitetura; histórico arquivado com header.
- **Risco:** apagar contexto histórico útil — arquivar, não destruir; nada é deletado sem inventário.
- **Aceite:** I5 verde; `docs/archive/legacy-pi/` com header ARCHIVED; lint de docs passa.
- **Validação:** `pnpm docs:lint`, `pnpm governance:check`, teste I5.
- **Dependência:** paralela a T4.1–T4.3.
- **Responsável:** Coder + Planner.

## Fase 5 — Qualidade e operação (H + J + K)

### T5.1 — CI, deploy gate e evidência (H1–H5)

- **Objetivo:** quando o billing do GitHub Actions for resolvido: re-executar CI + PWA CI **no SHA de produção** sem novo push; registrar evidência de deploy (SHA, digest, deployment id, migration, timestamp, smoke, CI run) no relatório V4; gate de paridade de SHA (H3) como checklist/script do processo de deploy manual; H5 documentar o risco da ausência de branch protection em vez de fingir proteção.
- **Arquivos prováveis:** `docs/reports/meu-ted-v4-implementation-report.md`, scripts de deploy (wrangler manual), `AGENTS.md` (seção Working Tree ao fechar).
- **RED primeiro:** não se aplica (operacional); bloqueio externo registrado como débito até resolver.
- **Mudança esperada:** nenhum código de produto; processos e evidência.
- **Risco:** registrar CI remoto como PASS sem execução — proibido (SPEC §19, critério de não conclusão §26).
- **Aceite:** evidência completa do release V4; débito CI fechado quando infra permitir.
- **Validação:** execução real.
- **Dependência:** externa (billing); coleta de evidência acontece em cada deploy de fase.
- **Responsável:** Planner + Tester.

### T5.2 — Lint real separado de typecheck (J1–J3)

- **Objetivo:** `lint` semântico distinto de `tsc` para `apps/api`, `apps/agent`, `apps/codex-broker`; categorias mínimas: promises não aguardadas, variáveis mortas, imports não utilizados, fallthrough, `any` inseguro, async incorreto, comparações suspeitas, ciclos quando viável. Ferramenta: preferir Biome (já em devDeps da API) ou Oxlint; decisão não é arquitetural.
- **Arquivos prováveis:** `apps/api/package.json:9,18` (separar), `apps/agent/package.json`, `apps/codex-broker/package.json`, config na raiz ou por app, integração no gate `pnpm lint` (`package.json:23`).
- **RED primeiro:** gate falha na baseline com os achados do linter real (baseline conhecida: ~25 avisos pré-existentes na PWA são fora de escopo; só apps sem lint entram).
- **Mudança esperada:** novos warnings/erros corrigidos ou suprimidos com justificativa inline.
- **Risco:** explosão de achados — começar com categorias mínimas, sem governance por estilo.
- **Aceite:** `pnpm lint` roda linter real nos 4 apps e passa; `lint` ≠ `typecheck` em todos.
- **Validação:** `pnpm lint`.
- **Dependência:** independente; **obrigatória para o fechamento da V4 (VAL-V4.2)** — prioridade P3 não a torna opcional nem delegável a débito (REV-V4-2).
- **Responsável:** Coder.

### T5.3 — Modularização oportunista (K)

- **Objetivo:** extrair responsabilidades de `app-state-context.tsx` (2.121 linhas) e `TedChat.tsx` (808 linhas) **apenas** quando tocados por trabalho real das fases anteriores; candidatos: TransactionsState, CardsState, PayablesState, ReconciliationState, TedConversationController, TedAttachmentsController, TedPendingOperationsController, TedRecordingController.
- **Arquivos prováveis:** `apps/pwa/src/lib/state/app-state-context.tsx`, `apps/pwa/src/features/ted/TedChat.tsx`, novos módulos vizinhos.
- **RED primeiro:** toda extração precedida de teste que capture o comportamento atual (nenhuma mudança de comportamento sem RED).
- **Mudança esperada:** arquivos menores com contratos claros; zero mudança comportamental.
- **Risco:** big-bang disfarçado — proibido (SPEC §17); extração só no arquivo já modificado pela tarefa corrente.
- **Aceite:** suítes verdes; nenhum comportamento alterado.
- **Validação:** PWA tests.
- **Dependência:** opportunistica; **nunca bloqueia o fechamento da V4**.
- **Responsável:** Coder; reviewer.

## Matriz de rastreabilidade (requisito → tarefa → RED → teste/prova → gate → critério)

| Requisito SPEC | Tarefa(s) | RED | Teste/prova | Gate | Critério §25/§26 |
|---|---|---|---|---|---|
| A — Microfone (P1, §7) | T1.1, T1.2 | contrato capability↔header↔UI (2 sentidos); E2E denied path | XLT-01; gravação em Chromium real com headers do build; métrica `mic.error` (T0.4.7) | VAL-V4.6, VAL-V4.15 | §25 PWA (mic real, headers coerentes); §26.1 |
| B — Cookie-first (§8) | T2.1, T2.2, T2.3 | login/operação sem escrita em localStorage; token órfão ignorado; snapshot abre por `offlineSubjectId` sem credencial | XLT-02; E2E auth; requests autenticadas via fallback bearer (T0.4.1) | VAL-V4.6, VAL-V4.16 | §25 Seg.1; §26.2 |
| C — Device token (§9) | T2.4, T2.5 | leak de DB não autentica; rotação TTL; queries sem escopo falham | XLT-10; adversarial; contagem de tokens antigos (T0.4.2) | VAL-V4.4, VAL-V4.7 | §25 Seg.2; §26.3 |
| D — Offline policy (§10) | T2.6 | snapshot > `maxOfflineAge` bloqueado (incl. offline shell); write offline proibido | XLT-08, XLT-09; métrica `offline.locked` (T0.4.4) | VAL-V4.6 | §25 Seg.5; §26.5 |
| E — Descomissionamento (§11) | T4.1, T4.2, T4.3 | ARCH-V4-06a vermelho em T4.1 → verde em T4.2 (mesma fase); guard anti-import | ARCH-V4-06a/b (VAL-V4.9); XLT-06 pós-deploy; scaffold single-runtime; access-log (T0.4.3) | VAL-V4.9, VAL-V4.13 | §25 Agent (runtime único); §26.3 |
| F — Undo provado (§12) | T3.1, T3.2 | suíte compartilhada falha se divergência; crash nos 5 pontos | XLT-07 em Postgres real; replay convergente; replay/reconcile (T0.4.5-6) | VAL-V4.7, VAL-V4.8 | §25 Fin.4-5; §26.5 |
| G — Borda/CSP/localhost (§13) | T2.1, T2.7 | XLT-03/04 falham sem gate de env; XLT-05 falha com origens externas | XLT-03/04/05; build Cloudflare validado; CSP report real (T0.4.8) | VAL-V4.12, VAL-V4.14, VAL-V4.16 | §25 Seg.3-4; §26.4 |
| H — CI/deploy (§14) | T5.1 | n/a (operacional; bloqueio externo registrado) | evidência de release; smoke; CI honesto | VAL-V4.13, VAL-V4.16 | §25 Op.1-2; §26.7 |
| I — Legado documental (§15) | T4.4 | I5 falha com AGENTS.md contraditório | contrato documental; archive com header ARCHIVED | VAL-V4.9, docs:lint | §25 Op.3-4; §26.6 |
| J — Lint real (§16) | T5.2 | linter real reprova a baseline | linter nos 4 apps; `lint` ≠ `typecheck` | VAL-V4.2 (**obrigatório**) | §25 Op.5 |
| K — Modularização (§17) | T5.3 | RED por extração | suítes verdes sem mudança de comportamento | VAL-V4.6 | único bloco não bloqueante |
| Observabilidade (§24) | T0.4 + emissores em T1.1, T2.2, T2.4, T2.6, T2.7, T3.1, T4.1 | teste de privacidade do serializador de eventos | 8 métricas consultáveis (contrato T0.4) | VAL-V4.8 + relatório V4 | §24 integral — **não é débito** |
| INV-01..INV-10 (§6) | todas | conforme blocos | write policy; architecture checks; XLT | VAL-V4.9, VAL-V4.10 | §6 |
| Riscos R1–R5 (§27) | R1→T2.2/T2.3 (`offlineSubjectId`); R2→T4.2; R3→T2.7 (build primeiro); R4→T2.4/T2.5; R5→T3.1 | conforme tarefas | mitigação verificada nos testes dos blocos | gates dos blocos | §27 |
| D-V4-01..D-V4-11 (§28) | D-V4-11 → T2.2/T2.3/T2.6 + ADR-015; demais pré-existentes | n/a | ADR-015/016 (T0.3) + testes dos blocos | VAL-V4.9 | §28 |

## Gates finais e fechamento

- Executar a matriz VAL-V4.1..VAL-V4.16 (SPEC §19) sobre o SHA de release; gates locais valem com bloqueio CI registrado; re-execução remota no mesmo SHA quando o billing resolver (T5.1).
- Critérios de conclusão e de NÃO conclusão (SPEC §25/§26) verificados item a item no relatório V4.
- Sequenciamento de rollout por fase com smoke entre elas (SPEC §22); rollback independente por bloco (SPEC §23).
- **Débitos admitidos no fechamento (lista exaustiva, REV-V4-2):** (1) CI remoto por billing — jamais registrado como PASS sem executar; (2) branch protection indisponível por limite externo do plano GitHub — risco explicitamente registrado (H5); (3) Bloco K quando nenhuma refatoração oportunista for necessária. **Nada mais é débito:** lint real (J), microfone (A), cookie-first (B), device token hardening (C), offline policy (D), WorkspaceAgent ativo (E), architecture checks, Undo crash test (F), CSP/proxy hardening (G), documentação contraditória (I) e observabilidade §24 (T0.4) são obrigatórios para declarar a V4 concluída.
