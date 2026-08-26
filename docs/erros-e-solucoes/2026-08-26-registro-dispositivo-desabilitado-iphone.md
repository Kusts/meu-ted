---
type: error
id: ERR-2026-08-26-registro-dispositivo-desabilitado-iphone
title: "Registro de dispositivo desabilitado no iPhone — login PWA bloqueado por ITP (cookie cross-site)"
created: 2026-08-26
severity: crítica
status: corrigido
area: auth
sintoma: "Registro de dispositivo desabilitado."
---

# ERR-2026-08-26 — Registro de dispositivo desabilitado no iPhone

## Sintoma

- Ao tentar logar no PWA (`https://pi-finance-pwa.walissonead.workers.dev`) pelo iPhone, após inserir e-mail/senha a UI exibe `Registro de dispositivo desabilitado.` (mensagem vinda de `ApiError.message` em `apps/pwa/src/features/auth/AuthGate.tsx:87`).
- Em desktop o mesmo login funciona (ou falha intermitente).
- Logs VPS `docker logs pi-finance-api` (UTC 2026-08-26 ~20:10):
  ```
  POST /auth/sign-in/email 200 (975ms)   // req-3i
  POST /auth/devices/register 403 {code: auth.registration_disabled} // req-3j
  POST /auth/sign-in/email 200 (185ms)   // req-3l
  POST /auth/devices/register 403         // req-3m
  ```
  O `sign-in` autentica, mas o `register` imediatamente retorna `403`.

## Causa Raiz

1. **Proteção de registro:** `apps/api/src/routes/auth.ts:71` bloqueia `POST /auth/devices/register` quando `disableDeviceRegistration === true && !isAuthenticated`, retornando `403 {code:"auth.registration_disabled", message:"Registro de dispositivos desabilitado."}`.
   - `disableDeviceRegistration` é `true` em produção via `apps/api/src/env.ts:74` (`DISABLE_DEVICE_REGISTRATION !== 'false'`), `apps/api/src/server/production-routes.ts:81,116` e `~/infra/pi-finance-api/.env:DISABLE_DEVICE_REGISTRATION=true`.

2. **`isAuthenticated` depende de sessão Better-Auth via cookie:** `apps/api/src/routes/auth.ts:44-68` constrói `new Headers(req.headers)` e chama `getBetterAuthSessionContext` → `auth.api.getSession({headers})` (`apps/api/src/auth/better-auth.ts:29`). Em produção `better-auth` usa `SameSite=None; Secure; HttpOnly` (`apps/api/src/auth/better-auth.ts:54-57`) com `baseURL=https://api.synkroo.com.br` e `trustedOrigins=["https://pi-finance-pwa.walissonead.workers.dev"]` (`~/infra/pi-finance-api/.env`).

3. **ITP do Safari bloqueia cookie cross-site:** PWA em `workers.dev` e API em `synkroo.com.br` são cross-site. iPhone Safari com ITP (Intelligent Tracking Prevention, padrão ligado) descarta `Set-Cookie` cross-site mesmo com `SameSite=None` se não houver interação direta com `api.synkroo.com.br`. `apiFetch` em `apps/pwa/src/lib/api/client.ts:105` usa `credentials:"include"` corretamente, mas o browser não armazena/envia o cookie, então o segundo `fetch` chega sem `Cookie`, `getSession` retorna `undefined`, `isAuthenticated=false` → `403`.

4. **CORS incompleto para fallback:** `apps/api/src/server/cors.ts:33` permitia apenas `Content-Type, X-Device-Token, Idempotency-Key, Accept` e `apps/api/src/auth/better-auth-http.ts:52` permitia `Authorization` mas não `X-Workspace-Id`, bloqueando preflight quando o PWA tentasse enviar `Authorization: Bearer` como fallback.

## Solução Aplicada (2026-08-26 — commits `fd95178`, `14aec1f`)

| Arquivo | Antes | Depois |
|---------|-------|--------|
| `apps/api/src/auth/better-auth.ts:1-2,70` | `plugins: [admin()]` | `plugins: [admin(), bearer()]` — habilita `Bearer` plugin (`better-auth/plugins` `dist/plugins/bearer/index.mjs`: converte `Authorization: Bearer <token>` em cookie server-side e expõe `set-auth-token`) |
| `apps/api/src/server/cors.ts:18-33` | `Allow-Headers: Content-Type, X-Device-Token, Idempotency-Key, Accept` / sem `Expose-Headers` | `Allow-Headers: Content-Type, X-Device-Token, Idempotency-Key, Accept, Authorization, X-Workspace-Id` + `Expose-Headers: set-auth-token` |
| `apps/api/src/auth/better-auth-http.ts:52` | `Allow-Headers` sem `X-Workspace-Id`, sem `Expose-Headers` | `Allow-Headers: ..., Authorization, X-Workspace-Id` + `Expose-Headers: set-auth-token` para `OPTIONS /auth/*` |
| `apps/pwa/src/features/auth/AuthGate.tsx:5,59-66` | `await apiPost("/auth/sign-in/email", null, cred)` → `await apiPost("/auth/devices/register", null, {deviceName})` (só cookie) | `const signInRes = await apiFetch<{token?:string}>("/auth/sign-in/email", {method:"POST", body:JSON.stringify(cred)})` (`sign-in.mjs:312` retorna `{token: session.token}`) → `await apiFetch("/auth/devices/register", {method:"POST", headers:{Authorization:`Bearer ${sessionToken}`}, body:...})` — mantém `credentials:include` como primário, `Bearer` como fallback ITP |

### Patch em produção

Hot-patch aplicado via `docker cp` nos `dist` (`/monorepo/apps/api/dist/auth/better-auth.js`, `dist/server/cors.js`, `dist/auth/better-auth-http.js`) e `src` dentro do container `pi-finance-api`, seguido de `docker restart pi-finance-api`. Validado com `curl -i -X OPTIONS` mostrando `allow-headers` completo.

Imagem `pi-finance-api:main` será reconstruída no próximo `docker build -f apps/api/Dockerfile .` a partir de `main` já com o fix.

## Validação

- `pnpm typecheck` e `pnpm --filter pi-finance-api test` (815+ testes) — `tests/auth/device-register-blocked.test.ts` (`allows device registration when caller has a valid Better-Auth session`) e `tests/server/cors.test.ts` continuam verdes.
- `curl -i -X OPTIONS https://api.synkroo.com.br/auth/devices/register -H Origin:https://pi-finance-pwa.walissonead.workers.dev -H Access-Control-Request-Headers:Content-Type,Authorization` → `204` com `allow-headers: ..., Authorization, X-Workspace-Id` e `expose-headers: set-auth-token`.
- Logs após patch: `POST /auth/devices/register` deve retornar `201 {token, deviceId, householdId}` quando enviado com `Authorization: Bearer <session.token>` mesmo sem cookie.

## Procedimento para o usuário (iPhone)

1. Aguardar deploy Cloudflare Pages (≈2 min após push `main`).
2. No iPhone: fechar PWA, em Safari limpar dados ou remover/re-adicionar o PWA à tela inicial (força fetch da nova `AuthGate.tsx`).
3. Logar novamente em `https://pi-finance-pwa.walissonead.workers.dev`. Erro esperado se credencial inválida: `E-mail ou senha incorretos.` (401); se persistir `Registro desabilitado`, verificar `docker logs pi-finance-api --tail 50`.

## Lição / Prevenção

- Cookies cross-site com `SameSite=None` não são confiáveis em Safari/iOS (ITP) nem em cenários PWA `workers.dev` → `synkroo.com.br`. **Sempre prover fallback `Bearer`** para endpoints pós-login quando `disableDeviceRegistration=true`.
- Testar login E2E em Safari real (ou BrowserStack) com `Prevent Cross-Site Tracking` ligado, não apenas Chrome desktop.
- CORS para `Authorization` e `X-Workspace-Id` deve ser espelhado em `registerCors` e no handler `app.all('/auth/*')` de `better-auth-http.ts`; divergência causa preflight silencioso `403`.
- Manter `docs/erros-e-solucoes/` atualizado e espelhar em `Segundo Cérebro/Erros/` + `Projetos/pi-financeiro/Erros/` para memória duradoura.

## Referências

- `apps/api/src/routes/auth.ts:40-73` — gate de registro.
- `apps/api/src/auth/better-auth.ts:29-37` — `getBetterAuthSessionContext`.
- `apps/pwa/src/lib/api/client.ts:102-106` — `credentials:"include"` + `x-device-token`.
- `apps/api/node_modules/better-auth/dist/plugins/bearer/index.mjs` — `BEARER_SCHEME`.
- VPS `~/infra/pi-finance-api/.env` — `BETTER_AUTH_URL`, `TRUSTED_ORIGINS`, `CORS_ORIGIN`, `DISABLE_DEVICE_REGISTRATION`.
- Vault: `Erros/2026-08-26-pi-financeiro-registro-dispositivo-desabilitado-iphone.md` e `Projetos/pi-financeiro/Erros/`.

