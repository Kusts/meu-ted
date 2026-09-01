# Sessão Planner+Coder — Invites de Workspace Compartilhado (2026-08-31)

Run de orquestração: `run_00ae101892d6`
Planner: pi (`term_f8fee9c0…`) · Coder: OpenCode (`term_0bf4ab47…`)

## Objetivo

Permitir convidar outras contas para um **workspace compartilhado** e garantir que
todos os dados do workspace persistam e sejam visíveis para **todas as contas** do workspace.

## Decisões do usuário (autoritativas)

1. **Canal de entrega do convite**: E-MAIL. O owner insere o e-mail do convidado; o
   convidado recebe o convite por e-mail e **cria a conta** com aquele e-mail.
2. **Provedor de e-mail**: SMTP próprio (config via env; nenhum provider configurado hoje).
3. **Signup**: criar usuário normal (e-mail+senha, SEM admin). **Restrito ao convite**:
   só pode criar conta quem tiver e-mail na lista de convites pendentes (sem convite → não cria).
4. **UI**: portar o fluxo de convidar/aceitar para a `WorkspaceManagerPage` (rota `/workspaces`),
   descartando o `WorkspaceSheet` órfão (nunca montado no app real).
5. **Persistência**: validar fluxo completo ponta-a-ponta (convidar conta B → aceitar →
   dados financeiros do workspace shared visíveis nas duas contas).

## Estado atual (diagnóstico do Planner)

### Já existe (backend + client, funcionando)
- API `POST /auth/invites`, `POST /auth/invites/accept`, `GET /workspaces/:id/invites`,
  revoke, resend — registradas em `routes/index.ts` e `server/production-routes.ts`
  (`createPostgresInviteRuntime` + `createPostgresInviteStore`).
- Serviço `src/auth/invites.ts` (create/accept/list/revoke/resend, hash SHA-256 do token,
  delivery antes do commit, idempotência).
- PWA client: `createWorkspaceInvite`, `acceptWorkspaceInvite`, `fetchPendingInvites`,
  `resendInvite`, `revokeInvite` em `src/lib/api/workspaces.ts`.
- PWA context: `inviteMember`, `acceptInvite`, `resendInvite`, `revokeInvite` em
  `src/lib/auth/workspace-context.tsx`.

### Lacunas (o que falta)
1. **Sem mailer no projeto** (grep: nenhum nodemailer/resend/SMTP). Precisa de delivery SMTP.
2. **Signup desabilitado**: `better-auth.ts` `emailAndPassword.disableSignUp = config.disableSignUp ?? true`;
   env `DISABLE_SIGN_UP !== 'false'`. E `acceptInvite` (invites-postgres.ts) exige conta existente
   com e-mail igual ao do convite (`invite.user_not_found` / `invite.email_mismatch`).
3. **Token do convite não chega ao convidado**: só via `INVITE_DELIVERY_URL/TOKEN` (HTTP,
   não configurado na VPS). A API não devolve o token ao owner (intencional, segurança).
   → Fluxo-alvo: e-mail com link de aceite contendo o token.
4. **UI órfã**: `WorkspaceSheet.tsx` (form convidar + colar token) nunca é montado no app;
   `WorkspaceManagerPage` não tem form de convidar (só lista pendentes/revoga/reenvia + transferência).

### Arquitetura observada (para o Coder)
- Proxy PWA `apps/pwa/src/app/api/backend/[...path]/route.ts` → `https://api.synkroo.com.br`
  (front local usa API+banco da VPS; apenas o front roda local).
- Criação de conta: Better-Auth `signUpEmail` (rota `/auth/sign-up/email`) existe no plugin
  password padrão; hoje bloqueada por `disableSignUp`.
- Restrição "só cria conta com e-mail convidado": validar no backend contra a tabela `invites`
  (e-mail normalizado + pendente), antes/em substituição ao `signUp` padrão.

## Plano de execução (delegado ao Coder)

1. **API — delivery SMTP**: módulo `src/auth/invite-delivery-smtp.ts` (ou similar) usando
   nodemailer/`nodemailer` (adicionar dep) com config env (SMTP_HOST/PORT/USER/PASS/FROM + URL
   base do PWA para o link de aceite). Injetar no `server/index.ts` / `production-routes.ts`
   como alternativa ao `INVITE_DELIVERY_URL`.
2. **API — signup restrito a convite**: permitir `POST /auth/sign-up/email` apenas quando há
   convite pendente (e-mail normalizado) na tabela `invites`; usuário criado sem admin.
3. **PWA — portar fluxo**: form "Convidar membro" (e-mail) na `WorkspaceManagerPage` para owner
   de workspace shared; página/rota de aceite por link com token (ex.: `/convite?token=...`):
   se logado com e-mail certo → aceitar; se não → criar conta com e-mail pré-preenchido.
4. **PWA — remover órfão**: descartar `WorkspaceSheet` (confirmar que não é referenciado fora de testes).
5. **Validação**: TDD (RED→GREEN) — testes API (delivery, signup restrito, accept) + testes
   PWA (form, página de aceite); `pnpm typecheck`, `pnpm test`, `pnpm docs:lint`, `pnpm governance:check`.
6. **E2E manual**: com o PWA local apontando para a VPS, convidar uma 2ª conta → aceitar →
   verificar que dados financeiros do workspace shared aparecem nas duas contas.
   (Para testes de e-mail sem SMTP real: permitir modo dev que loga o link/token no console
   ou usa um SMTP de teste configurado por env.)

## Estado da orquestração

- Comunicação Planner↔Coder validada (handshake OK, worker retido).
- Próximo passo: `task-create` + `worker-start` com spec acima; aguardar `worker_done`.

## Riscos / observações

- Cold start do Next dev (~27s no 1º load) pode estourar o timeout de 15s do client → não confundir com bug.
- `INVITE_DELIVERY_URL` (HTTP) existente permanece como alternativa; SMTP será o canal primário.
- Segurança: token de convite permanece só no e-mail (não expor na UI/listagem por padrão).
- Gate de produção: `accepted@` e-mail do convite deve bater com o user logado (já validado).
## Review do Planner (2026-09-01) — APROVADO com observações

### Validações executadas pelo Planner (confirmando o Coder)
- Testes novos API: 7 pass (invite-delivery-smtp + invite-signup-guard)
- Testes novos PWA: 11 pass (ConvitePage + WorkspaceManagerPage)
- Suíte API completa: 946 pass
- Suíte PWA completa: 1032 pass (9 skipped)
- pnpm typecheck: OK (api, pwa, agent, codex-broker)
- pnpm docs:lint: PASSED · pnpm governance:check: OK
- Sem referências pendentes ao WorkspaceSheet removido

### O que foi implementado (validado no diff)
1. `apps/api/src/auth/invite-delivery-smtp.ts` — delivery SMTP (nodemailer dinâmico, transporter
   injetável p/ testes), link de aceite `?token=...`, fallback concat p/ URL inválida, HTMl+text pt-BR.
2. `apps/api/src/auth/invite-signup-guard.ts` — guard Postgres (invite pendente por email_normalized)
   + in-memory p/ testes.
3. `better-auth-http.ts` — no handler `/auth/*`: se POST /auth/sign-up/email e guard presente,
   valida convite pendente (403 `auth.signup_requires_invite`) antes do Better-Auth. Origin check
   prévio mantido.
4. `server/index.ts` — `disableSignUp: false` + guard criado com o pool e injetado nos dois caminhos.
   Delivery: SMTP primário (se smtpHost+from+acceptUrl), senão INVITE_DELIVERY_URL HTTP, senão undefined.
5. `env.ts` — SMTP_HOST/PORT/USER/PASS/FROM/SECURE + INVITE_ACCEPT_URL (ou PWA_ORIGIN+/convite).
6. `invites.ts/.postgres.ts` + `invites-http.ts` — novo `verifyInvite` público (posse do token = autorização):
   retorna email/householdId/role/expiresAt; rota `POST /auth/invites/verify`.
7. PWA: `src/app/convite/page.tsx` — verifica token, checa sessão, fluxos: logado c/ e-mail certo →
   Aceitar; não-logado → criar conta (nome/email/senha, exige e-mail == convite, min 8 chars) → signup
   → login → registerDeviceToken → aceitar → remove token da URL → /workspaces.
8. PWA: form "Convidar membro" na WorkspaceManagerPage (owner de shared); removed WorkspaceSheet.
9. PWA: `signUpWithEmail`, `fetchSession`, `verifyWorkspaceInvite` no client; `/convite` fora do
   AuthGate no RootProviders (rota pública por design).

### Observações de risco (não bloqueiam, registrar para follow-up)
- **R1 — fail-open no signup**: `disableSignUp: false` hardcoded em server/index.ts e o guard é
  condicional (`if (inviteSignupGuard && ...)`). Hoje o guard é SEMPRE injetado quando pool existe
  (produção), então não há janela real; mas se um dia o guard não for passado, o signup ficaria
  aberto. Sugestão: condicionar `disableSignUp: cfg.disableSignUp` e só forçar false quando guard presente,
  ou lançar erro se guard ausente quando signup habilitado. Follow-up opcional.
- **R2 — E2E manual pendente**: fluxo ponta-a-ponta (SMTP real + 2ª conta criando via convite) não
  validado (depende de SMTP real ou modo dev de log do link). Requer credenciais SMTP da VPS.
- **R3 — persistência multitenant**: confirmada por arquitetura (memberships por household; rotas de
  dados filtram por workspace/household), mas o teste E2E com 2 contas ainda não foi executado.

### Próximos passos
- [ ] Configurar SMTP (env) na VPS e testar envio real do e-mail de convite
- [ ] Validar E2E: conta A (owner) convida conta B → B cria conta via link → aceita → ambas veem dados do workspace shared
- [ ] (Opcional) Hardening R1: fail-closed no signup

## SMTP — decisão e validação (2026-09-01)

- **Remetente escolhido**: `walissonead@gmail.com` (conta ADMIN da plataforma, ADMIN_EMAILS default).
  A conta `synkrooia@gmail.com` foi testada com 3 credenciais (senha comum + 2 App Passwords) e o
  Google rejeitou todas com `535 BadCredentials` — bloqueio por política da conta (provável 2FA/inconsistência),
  não por digitação. App Password da conta admin funcionou no 1º teste.
- **Validação**: probe nodemailer (smtp.gmail.com:587, STARTTLS) → `SMTP_OK <8b069db9...@gmail.com>`
  (e-mail de teste enviado com sucesso para walissonead@gmail.com + synkrooia@gmail.com).
- **Config a aplicar na VPS**: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER/SMTP_FROM=walissonead@gmail.com,
  SMTP_PASS=<App Password no .env da VPS, NUNCA commitar>, SMTP_SECURE=false, INVITE_ACCEPT_URL=https://pi-finance-pwa.walissonead.workers.dev/convite.
- **Mecanismo de release da API (descoberto)**: source standalone em `~/infra/pi-finance-api/app`
  (`WORKDIR /app`, pnpm-lock na raiz), imagem `pi-finance-api:release-<hash>` → tag `:main` → compose up.
  Não há script de release; processo manual: sync apps/api → app/, docker build, tag, restart, healthcheck.
- **PWA**: deploy automático via Cloudflare Pages (auto-deploy main) — rota /convite entra com o push.

## Release em produção — VALIDADO (2026-09-01, commit f7488d0)

### Executado
1. Commit `f7488d0` (24 arquivos) + `git push origin main` → auto-deploy PWA (rota /convite).
2. Sync apps/api → VPS `~/pi-financeiro` (tar+scp, sem node_modules/dist).
3. `docker build -f apps/api/Dockerfile -t pi-finance-api:release-f7488d0` (VPS) → tag `:main` → `docker compose up -d`.
4. `.env` VPS: SMTP_HOST/PORT/USER/PASS/FROM/SECURE + INVITE_ACCEPT_URL (via stdin, sem histórico).
5. Rollback disponível: imagem antiga tag `release-9cecb4f6a8ff` preservada.

### Validações em produção
- Container `Up (healthy)`; `api.synkroo.com.br/health` → `{"status":"ok"}`.
- `POST /auth/sign-up/email` SEM convite → `403 auth.signup_requires_invite` (mensagem pt-BR) ✅ guard ativo.
- `POST /auth/invites/verify` token inválido → `404 invite.not_found` ✅ rota nova no ar.
- Tabela `invites` existe no banco prod (schema compatível: email_normalized, token_hash, consumed_at, revoked_at).
- Probe SMTP local (walissonead@gmail.com + App Password): `SMTP_OK` ✅ (e-mail teste enviado).

### Observações
- Erro pré-existente (não relacionado): job de push reminders falha com `42P01` pois a tabela
  `push_reminder_deliveries` não existe no schema legacy (MIGRATIONS_MODE=disabled). Já falhava na imagem anterior.
- Falta E2E manual com 2 contas reais (depende de UI autenticada): criar convite de workspace shared,
  receber e-mail, criar 2ª conta, aceitar, ver dados nas duas contas.

## BUG DE PRODUÇÃO DESCOBERTO no E2E (2026-09-01) — idempotency legacy quebrado

### Sintoma
- Form "Convidar membro" no PWA local (contra VPS) falha: `column "household_id" of relation "operation_records" does not exist` (HTTP 500).
- Confirmação via log da VPS: `dist/writes/postgres.js:372` → `createPostgresIdempotencyStore` legacy path.

### Causa raiz (banco híbrido da VPS)
- `operation_records` = schema CANÔNICO (V013/V014, 05/08): workspace_id, payload_hash, status, lease_until, retry_until, retention_until, completed_at, actor_type, response, effect_ref.
- `audit_logs` = schema LEGACY preservado: household_id, user_id, action, entity_type, entity_id, before_json, after_json, created_at (SEM operation_record_id/workspace_id/actor_id).
- Commit `9efdfc3` (30/08 18:00, ANTERIOR à feature de invites) trocou `createPostgresIdempotencyStore({ pool })` → `{ pool, legacy: true }` no boot legacy da VPS (DB_SCHEMA=legacy). O legacy path insere:
  - operation_records com household_id/request_payload/actor_type → COLUNAS INEXISTENTES → 42703.
- O caminho canônico tenta audit_logs com operation_record_id/workspace_id → COLUNAS INEXISTENTES no audit_logs legacy → também quebraria.
- Por que nada quebrou antes: última mutação com idempotency-key na VPS foi push em 12/08 (antes do 9efdfc3, quando o path era canônico e o audit era gravado como entity_type='operation'/entity_id=<record_id>). Transações do PWA não enviam idempotency-key (bypass) → continuam funcionando.

### Fix (delegado ao Coder)
Corrigir o legacy path de `createPostgresIdempotencyStore` (apps/api/src/writes/postgres.ts ~linha 480):
1. INSERT em `operation_records` usando colunas CANÔNICAS REAIS: workspace_id, actor_id, operation, idempotency_key, payload_hash, status='processing', lease_until, retry_until, retention_until (+ claim/update como no path canônico OU INSERT simples + update completed; seguir padrão de replay do path canônico para manter idempotência).
2. INSERT em `audit_logs` usando colunas LEGACY REAIS: household_id, user_id, action, entity_type='operation', entity_id=<operation_record_id>, before_json, after_json, created_at (mesmo shape que os registros push de 12/08).
3. TDD: testes com SQL verificado contra schema real (mock deve VALIDAR nomes de colunas, não só aceitar INSERT; inspecionar SQL gerado e comparar com colunas reais documentadas acima). Atualizar `tests/server/legacy-idempotency-wiring.test.ts` (mock atual aceita qualquer INSERT — insuficiente).
4. Validar: pnpm typecheck + pnpm --filter pi-finance-api test + docs:lint + governance:check.
5. NÃO deployar sem review do Planner. NÃO commitar sem aprovação.
