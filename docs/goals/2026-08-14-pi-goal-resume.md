# Retomada da fila de goals após migração para @amaster.ai/pi-goal

- **Projeto:** `D:/projetos/pi-financeiro`
- **Migração:** 2026-08-14
- **Ativação:** manual e sequencial; este documento não inicia execução
- **Estado legado:** preservado no backup global da migração

## Goal legado atual

- **ID:** `20260812191456-vgnc4h`
- **Objetivo:** [G6.1.2] Reminder server-side com timezone, lock, dedupe e observabilidade
- **Status final no GLLA:** `paused`
- **Status P0.7 (2026-08-17):** `blocked` — fail-closed guard verificado (`pnpm --dir apps/api test:integration` sai 1 sem env, zero skip); integração PostgreSQL real não executada (sem Postgres descartável: Docker down, 5432 livre, `DATABASE_URL_TEST`/`DB_TEST_MARKER` unset). Conclusão de G6.1.2 exige a integração (2 arquivos/3 testes sem skip); permanece bloqueado até haver evidência. Ver `docs/superpowers/goal-runs/G6.1.2.md`.
- **Status (2026-08-18, loop 632842db):** `blocked` **CONFIRMADO — ambiente ausente**: `docker ps` falha (pipe do daemon Docker Desktop não encontrado); `DATABASE_URL_TEST`/`DB_TEST_MARKER` seguem unset. A infraestrutura de integração (postgres-reminder-dedupe, postgres-reminder-lock, postgres-adoption) **já está commitada e fail-closed** (753e7a7/ec702c0), aguardando apenas Postgres descartável para rodar sem skip. Env-guards `require-reminder-integration-env.mjs`/`require-adoption-integration-env.mjs` versionados.
- **Atualizado em:** `2026-08-13T14:57:36.447Z`
- **Telemetria:** 4 turns, 23 file writes, 342 bash calls
- **Tokens registrados:** 590,855
- **Auditorias registradas:** 20

### Gap da última auditoria

- Run and preserve PostgreSQL integration output showing 2 files and 3 tests passed, or make the integration command fail instead of silently skipping without `DATABASE_URL_TEST` and `DB_TEST_MARKER`.

### Condição `/goal` para concluir G6.1.2

```text
/goal Fechar [G6.1.2] sem repetir a implementação já registrada: executar a integração PostgreSQL do reminder scheduler com DATABASE_URL_TEST e DB_TEST_MARKER válidos, tornar o comando fail-closed quando essas variáveis faltarem e provar dedupe durável e contenção real do advisory lock. Encerrar apenas quando 2 arquivos e 3 testes de integração passarem sem skip e o output completo estiver no transcript.
```

## Fila preservada: 29 próximos goals

Execute somente um item por vez e mantenha a ordem abaixo. Antes de cada ativação, crie/retome o task contract correspondente no `pi-tasks`.

### Item 01 — [G6.1.3] Share Target, manifest shortcuts e atalho iOS para captura rápida ✅ CONCLUÍDO (commit `924bd37`)

- **ID legado:** `20260729142146-cfc8bs`
- **Contrato legado:** compartilhar do Android/iOS abre PWA no formulário de despesa.
- **Status (2026-08-18):** ENTREGUE. Rota `/capture`, `share_target` e shortcut "Novo gasto" no manifesto, bridge client-side (kind=expense + prefill da descrição + normalização via `history.replaceState`), evento `pwa:open-tx` no AppShell.
- **Comando /goal (histórico):**

```text
/goal [G6.1.3] Share Target, manifest shortcuts e atalho iOS para captura rápida. Concluído somente quando: compartilhar do Android/iOS abre PWA no formulário de despesa. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 02 — [G6.1.4] Medir entrega, abertura, uso do chat e tempo de captura (métricas de adoção) ✅ CONCLUÍDO (commits `924bd37`+`41bce95`+`753e7a7`)

- **ID legado:** `20260729142146-v48v20`
- **Contrato legado:** dashboard de métricas operacionais; funnel de notificação.
- **Status (2026-08-18):** ENTREGUE. API: `POST /observability/adoption-events` + `GET /observability/adoption-funnel` (workspace-scoped, schema zod validado, store Postgres/in-memory em `apps/api/src/observability/adoption.ts`); PWA: `recordAdoptionEvent` (capture_started/completed, notification_opened, chat_used), dashboard `AdoptionMetrics.tsx` em Reports, instrumentação em `sw-coordinator.tsx`/`ProfilePage`. Testes verdes (adoption.test.ts API 5×, AdoptionMetrics.test.tsx PWA).
- **Comando /goal (histórico):**

```text
/goal [G6.1.4] Medir entrega, abertura, uso do chat e tempo de captura (métricas de adoção). Concluído somente quando: dashboard de métricas operacionais; funnel de notificação. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 03 — [G6.2.1] Estágio A: Pi continua dono da resposta, mas tools usam API sem SQL direto

- **ID legado:** `20260729142146-t0cxtu`
- **Contrato legado:** todas as tools do Pi passam pela API; zero SQL direto.
- **Comando /goal:**

```text
/goal [G6.2.1] Estágio A: Pi continua dono da resposta, mas tools usam API sem SQL direto. Concluído somente quando: todas as tools do Pi passam pela API; zero SQL direto. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 04 — [G6.2.2] Estágio B: novo Agent recebe shadow read-only; não responde nem executa side effect

- **ID legado:** `20260729142146-186qes`
- **Contrato legado:** Agent shadow mede divergência sem interferir.
- **Comando /goal:**

```text
/goal [G6.2.2] Estágio B: novo Agent recebe shadow read-only; não responde nem executa side effect. Concluído somente quando: Agent shadow mede divergência sem interferir. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 05 — [G6.2.3] Estágio C: bridge envia WhatsApp ao Agent com phone→user/workspace resolvido server-side

- **ID legado:** `20260729142146-s8aj5k`
- **Contrato legado:** WhatsApp→Agent funcional; Pi em fallback read-only.
- **Comando /goal:**

```text
/goal [G6.2.3] Estágio C: bridge envia WhatsApp ao Agent com phone→user/workspace resolvido server-side. Concluído somente quando: WhatsApp→Agent funcional; Pi em fallback read-only. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 06 — [G6.2.4] Em cada estágio, exatamente 1 runtime responde/executa; feature flag define rollback

- **ID legado:** `20260729142146-k1mshq`
- **Contrato legado:** toggle por estágio; rollback documentado e testado.
- **Comando /goal:**

```text
/goal [G6.2.4] Em cada estágio, exatamente 1 runtime responde/executa; feature flag define rollback. Concluído somente quando: toggle por estágio; rollback documentado e testado. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

- **Consent gate:** ação externa/credencial: confirmar antes de executar.

### Item 07 — [G6.2.5] Congelar writes Pi e manter fallback read-only antes de remover runtime

- **ID legado:** `20260729142146-qreath`
- **Contrato legado:** Pi tools retornam erro em write; read-only ainda funciona.
- **Comando /goal:**

```text
/goal [G6.2.5] Congelar writes Pi e manter fallback read-only antes de remover runtime. Concluído somente quando: Pi tools retornam erro em write; read-only ainda funciona. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

- **Consent gate:** remoção/arquivo: confirmar o conjunto exato e o rollback.

### Item 08 — [G6.2.6] Validar inventário de capacidade e aceite humano item a item

- **ID legado:** `20260729142146-fgy6s7`
- **Contrato legado:** cada capability do inventário tem check de paridade aprovado.
- **Comando /goal:**

```text
/goal [G6.2.6] Validar inventário de capacidade e aceite humano item a item. Concluído somente quando: cada capability do inventário tem check de paridade aprovado. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 09 — [G6.2.7] Executar soak test com rollback testado

- **ID legado:** `20260729142146-rfef4j`
- **Contrato legado:** período de soak definido; rollback exercitado e aprovado.
- **Comando /goal:**

```text
/goal [G6.2.7] Executar soak test com rollback testado. Concluído somente quando: período de soak definido; rollback exercitado e aprovado. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

- **Consent gate:** ação externa/credencial: confirmar antes de executar.

### Item 10 — [G6.2.8] Remover webhook/Evolution, observar, depois remover bridge e .pi/

- **ID legado:** `20260729142146-bayc1x`
- **Contrato legado:** whatsapp-bridge/ deletado; .pi/extensions/financial-tools/ arquivado.
- **Comando /goal:**

```text
/goal [G6.2.8] Remover webhook/Evolution, observar, depois remover bridge e .pi/. Concluído somente quando: whatsapp-bridge/ deletado; .pi/extensions/financial-tools/ arquivado. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

- **Consent gate:** remoção/arquivo: confirmar o conjunto exato e o rollback.

### Item 11 — [G6.2.9] Rotacionar secrets e remover referências residuais ao WhatsApp

- **ID legado:** `20260729142146-vddmpd`
- **Contrato legado:** zero menções a Evolution/WhatsApp em código e config ativos.
- **Comando /goal:**

```text
/goal [G6.2.9] Rotacionar secrets e remover referências residuais ao WhatsApp. Concluído somente quando: zero menções a Evolution/WhatsApp em código e config ativos. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

- **Consent gate:** ação externa/credencial: confirmar antes de executar.

### Item 12 — [G6.GATE] Verificar Gate G6: nenhum fluxo crítico depende do WhatsApp; rollback mantém dados íntegros

- **ID legado:** `20260729142146-gx7iho`
- **Contrato legado:** WhatsApp desligado 48h; zero alertas; rollback testado.
- **Comando /goal:**

```text
/goal [G6.GATE] Verificar Gate G6: nenhum fluxo crítico depende do WhatsApp; rollback mantém dados íntegros. Concluído somente quando: WhatsApp desligado 48h; zero alertas; rollback testado. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

- **Consent gate:** ação externa/credencial: confirmar antes de executar.

### Item 13 — [G7.1] Reescrever README e AGENTS com arquitetura real (não histórica)

- **ID legado:** `20260729142146-d51gnh`
- **Contrato legado:** README e AGENTS refletem arquitetura atual; sem referências obsoletas.
- **Comando /goal:**

```text
/goal [G7.1] Reescrever README e AGENTS com arquitetura real (não histórica). Concluído somente quando: README e AGENTS refletem arquitetura atual; sem referências obsoletas. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 14 — [G7.2] Criar PRODUCT.md, ARCHITECTURE-CURRENT.md, ARCHITECTURE-TARGET.md e ROADMAP.md

- **ID legado:** `20260729142146-19pu27`
- **Contrato legado:** 4 docs canônicos na raiz; cada um atualizado e auto-contido.
- **Comando /goal:**

```text
/goal [G7.2] Criar PRODUCT.md, ARCHITECTURE-CURRENT.md, ARCHITECTURE-TARGET.md e ROADMAP.md. Concluído somente quando: 4 docs canônicos na raiz; cada um atualizado e auto-contido. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 15 — [G7.3] Extrair ADRs válidas e arquivar specs/planos superados

- **ID legado:** `20260729142146-dfvii4`
- **Contrato legado:** docs/adr/ contém decisões ativas; specs antigas em archive/.
- **Comando /goal:**

```text
/goal [G7.3] Extrair ADRs válidas e arquivar specs/planos superados. Concluído somente quando: docs/adr/ contém decisões ativas; specs antigas em archive/. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

- **Consent gate:** remoção/arquivo: confirmar o conjunto exato e o rollback.

### Item 16 — [G7.4] Manter somente planos ativos com status atualizado; remover concluídos

- **ID legado:** `20260729142146-9zqy2g`
- **Contrato legado:** docs/superpowers/plans/ só tem planos em execução.
- **Comando /goal:**

```text
/goal [G7.4] Manter somente planos ativos com status atualizado; remover concluídos. Concluído somente quando: docs/superpowers/plans/ só tem planos em execução. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 17 — [G7.5] Adicionar lint documental contra links quebrados e fatos contáveis

- **ID legado:** `20260729142146-rgryhs`
- **Contrato legado:** CI verifica links internos; referências a arquivos inexistentes falham.
- **Comando /goal:**

```text
/goal [G7.5] Adicionar lint documental contra links quebrados e fatos contáveis. Concluído somente quando: CI verifica links internos; referências a arquivos inexistentes falham. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 18 — [VAL.1] Validar pnpm install --frozen-lockfile reproduzível

- **ID legado:** `20260729142146-z1zzsr`
- **Contrato legado:** CI e local instalam sem mudanças no lockfile.
- **Comando /goal:**

```text
/goal [VAL.1] Validar pnpm install --frozen-lockfile reproduzível. Concluído somente quando: CI e local instalam sem mudanças no lockfile. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 19 — [VAL.2] Validar pnpm lint — 3 workspaces sem erro

- **ID legado:** `20260729142146-b3qbsf`
- **Contrato legado:** lint passa em api, bridge e pwa.
- **Comando /goal:**

```text
/goal [VAL.2] Validar pnpm lint — 3 workspaces sem erro. Concluído somente quando: lint passa em api, bridge e pwa. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 20 — [VAL.3] Validar pnpm typecheck — produção, testes e scripts tipados

- **ID legado:** `20260729142146-cse4r5`
- **Contrato legado:** tsc --noEmit passa em todos os workspaces.
- **Comando /goal:**

```text
/goal [VAL.3] Validar pnpm typecheck — produção, testes e scripts tipados. Concluído somente quando: tsc --noEmit passa em todos os workspaces. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

- **Consent gate:** ação externa/credencial: confirmar antes de executar.

### Item 21 — [VAL.4] Validar pnpm test — suites unit/contract verdes sem DB externo

- **ID legado:** `20260729142146-e4oin3`
- **Contrato legado:** todos os testes passam; zero dependência de Postgres externo.
- **Comando /goal:**

```text
/goal [VAL.4] Validar pnpm test — suites unit/contract verdes sem DB externo. Concluído somente quando: todos os testes passam; zero dependência de Postgres externo. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 22 — [VAL.5] Validar pnpm test:coverage — mínimo 80% global

- **ID legado:** `20260729142146-tpkwf7`
- **Contrato legado:** coverage report mostra ≥80% em todos os workspaces.
- **Comando /goal:**

```text
/goal [VAL.5] Validar pnpm test:coverage — mínimo 80% global. Concluído somente quando: coverage report mostra ≥80% em todos os workspaces. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 23 — [VAL.6] Validar pnpm test:integration — Postgres descartável com guards ativos

- **ID legado:** `20260729142146-wb6hx2`
- **Contrato legado:** integração passa com DATABASE_URL_TEST e marker.
- **Comando /goal:**

```text
/goal [VAL.6] Validar pnpm test:integration — Postgres descartável com guards ativos. Concluído somente quando: integração passa com DATABASE_URL_TEST e marker. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 24 — [VAL.7] Validar pnpm test:e2e — fluxos críticos e authz completos

- **ID legado:** `20260729142146-s0o3e0`
- **Contrato legado:** E2E cobre criar, editar, pagar, invite, switch workspace, chat.
- **Comando /goal:**

```text
/goal [VAL.7] Validar pnpm test:e2e — fluxos críticos e authz completos. Concluído somente quando: E2E cobre criar, editar, pagar, invite, switch workspace, chat. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 25 — [VAL.8] Validar pnpm build — API, bridge transitório, PWA e Agent compilam

- **ID legado:** `20260729142146-ea1snn`
- **Contrato legado:** todos os apps buildam sem erro.
- **Comando /goal:**

```text
/goal [VAL.8] Validar pnpm build — API, bridge transitório, PWA e Agent compilam. Concluído somente quando: todos os apps buildam sem erro. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 26 — [VAL.9] Validar pnpm security:check — secrets, deps, SAST e containers

- **ID legado:** `20260729142146-ksinc6`
- **Contrato legado:** security check passa sem CRITICAL.
- **Comando /goal:**

```text
/goal [VAL.9] Validar pnpm security:check — secrets, deps, SAST e containers. Concluído somente quando: security check passa sem CRITICAL. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

### Item 27 — [VAL.10] Production smoke read-only: health, auth deny, assets e rollback

- **ID legado:** `20260729142146-3hly8g`
- **Contrato legado:** smoke test pós-deploy automatizado.
- **Comando /goal:**

```text
/goal [VAL.10] Production smoke read-only: health, auth deny, assets e rollback. Concluído somente quando: smoke test pós-deploy automatizado. Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

- **Consent gate:** ação externa/credencial: confirmar antes de executar.

### Item 28 — Implementar Fase 3 (G3) — correção funcional do PWA (itens 2-8): endpoint GET /dashboard/summary server-side, paginação real no sync-engine, correção de subcategoria/drafts no NewTransactionSheet, remoção de gráfico fictício, padronização de mutators com idempotency key, e cobertura de testes com gate verde. Fora de escopo: WhatsApp bridge, deploy, auth/identidade (Fase 4), chat/Agent (Fase 5).

- **ID legado:** `20260729162722-qm6wr7`
- **Contrato legado:** Done when:; pnpm test:api e pnpm test:pwa passam com 0 falhas; GET /dashboard/summary existe na API e retorna agregados (saldo total, receitas/despesas do mês corrente); sync-engine.ts não usa limit: hardcoded — implementa paginação (offset + limit) com fetchTransactionsPage; Home page consome /dashboard/summary para agregados — não calcula client-side sobre lista de transactions; NewTransactionSheet: subcategoria preservada ao trocar expense↔income; drafts sobrevivem a fechar/abrir o sheet; Gráfico patrimonial fictício e opções não persistidas removidos do PWA; Mutators geram idempotencyKey antes do request e retornam resultado canônico tipado (não {success: true} genérico); pnpm test:pwa -- --coverage mostra >=80% no código modificado
- **Comando /goal:**

```text
/goal Implementar Fase 3 (G3) — correção funcional do PWA (itens 2-8): endpoint GET /dashboard/summary server-side, paginação real no sync-engine, correção de subcategoria/drafts no NewTransactionSheet, remoção de gráfico fictício, padronização de mutators com idempotency key, e cobertura de testes com gate verde. Fora de escopo: WhatsApp bridge, deploy, auth/identidade (Fase 4), chat/Agent (Fase 5).. Concluído somente quando: Done when:; pnpm test:api e pnpm test:pwa passam com 0 falhas; GET /dashboard/summary existe na API e retorna agregados (saldo total, receitas/despesas do mês corrente); sync-engine.ts não usa limit: hardcoded — implementa paginação (offset + limit) com fetchTransactionsPage; Home page consome /dashboard/summary para agregados — não calcula client-side sobre lista de transactions; NewTransactionSheet: subcategoria preservada ao trocar expense↔income; drafts sobrevivem a fechar/abrir o sheet; Gráfico patrimonial fictício e opções não persistidas removidos do PWA; Mutators geram idempotencyKey antes do request e retornam resultado canônico tipado (não {success: true} genérico); pnpm test:pwa -- --coverage mostra >=80% no código modificado Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

- **Consent gate:** ação externa/credencial: confirmar antes de executar.

### Item 29 — Item 1 da lista: Escrever testes unitários RED (TDD) para os módulos de estado do PWA — mutators (commands.ts), reducers (state-reducer.ts), agregações (snapshot-db.ts, sync-engine.ts) e drafts (app-state-context.tsx) em apps/pwa/src/lib/state/. Cada módulo ganha cobertura de unit test com casos de sucesso, falha, borda e concorrência. Os 10 testes que já falham em app-state-context.test.tsx são investigados como potencial impedimento — se a causa for código de produção quebrado e não teste obsoleto, o goal pausa para decisão.

- **ID legado:** `20260729170531-ngpr6t`
- **Contrato legado:** Done when:; pnpm test:pwa --run mostra 0 failures (tanto os novos quanto os 10 pré-existentes resolvidos); Novos arquivos de teste criados em apps/pwa/src/lib/state/**tests**/ ou apps/pwa/src/**tests**/ cobrindo commands, state-reducer, snapshot-db, sync-engine, app-state-context; Cada módulo alvo tem pelo menos 3 casos de teste (happy path, erro, borda); Nenhum teste anterior removido ou enfraquecido sem justificativa documentada
- **Comando /goal:**

```text
/goal Item 1 da lista: Escrever testes unitários RED (TDD) para os módulos de estado do PWA — mutators (commands.ts), reducers (state-reducer.ts), agregações (snapshot-db.ts, sync-engine.ts) e drafts (app-state-context.tsx) em apps/pwa/src/lib/state/. Cada módulo ganha cobertura de unit test com casos de sucesso, falha, borda e concorrência. Os 10 testes que já falham em app-state-context.test.tsx são investigados como potencial impedimento — se a causa for código de produção quebrado e não teste obsoleto, o goal pausa para decisão.. Concluído somente quando: Done when:; pnpm test:pwa --run mostra 0 failures (tanto os novos quanto os 10 pré-existentes resolvidos); Novos arquivos de teste criados em apps/pwa/src/lib/state/__tests__/ ou apps/pwa/src/__tests__/ cobrindo commands, state-reducer, snapshot-db, sync-engine, app-state-context; Cada módulo alvo tem pelo menos 3 casos de teste (happy path, erro, borda); Nenhum teste anterior removido ou enfraquecido sem justificativa documentada Registre no transcript os comandos executados, exit codes e outputs completos que provem o contrato.
```

- **Consent gate:** ação externa/credencial: confirmar antes de executar.

## Regras de execução

1. Não combine itens desta fila em um único `/goal`.
2. O próximo item só pode ser ativado após evidência e encerramento do anterior.
3. O estado persistente fica no `pi-tasks` e nos arquivos do projeto; `/goal` é session-scoped.
4. Itens com espera longa, como a janela de 48 horas, devem registrar o wait no `pi-tasks`; não dependa da memória do `/goal`.
5. Confirme ações externas, destrutivas, de produção ou rotação de secrets antes de executar.
6. Se tentativas repetidas não produzirem nova evidência, mude de abordagem e registre o blocker.
