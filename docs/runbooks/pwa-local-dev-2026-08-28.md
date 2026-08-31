# Runbook — PWA Local Dev

> **Objetivo:** rodar `apps/pwa` localmente em `http://127.0.0.1:3000` com interface íntegra, login via `api.synkroo.com.br` e TED sem `Agent não configurado`.
> **Stack:** Next.js 16 + Webpack, `output: standalone`, `apps/pwa/e2e/standalone-server.mjs`, `apps/pwa/src/middleware.ts` (CSP), `apps/pwa/src/app/api/backend` e `apps/pwa/src/app/api/agent`.

---

## 1. Problemas Conhecidos e Soluções

### 1.1 Porta 3000 ocupada
- **Sintoma:** Porta `3000` já em uso por outro processo local, impedindo o PWA de subir ou fazendo o harness conectar no serviço incorreto.
- **Solução:** Encerrar o processo conflitante na porta `3000` ou configurar porta alternativa via variável `PORT` (ex.: `PORT=3002 pnpm pwa:prod`). Para fluxos com `CORS_ORIGIN` e `TRUSTED_ORIGINS`, prefira liberar a porta `3000`.

### 1.2 Assets Estáticos Quebrados — `404 /_next/static/*`
- **Sintoma:** HTML retorna status `200`, mas requisições para `/_next/static/css/*.css` retornam `404`.
- **Causa:** O modo `output: "standalone"` do Next.js aninha o servidor em `.next/standalone/apps/pwa/server.js`. Executar o arquivo sem copiar `.next/static` e `public` faz com que os assets não sejam localizados.
- **Solução Durável:** Utilizar o wrapper `apps/pwa/e2e/standalone-server.mjs` que copia `.next/static` e `public` para a raiz do standalone e executa o servidor. Comando canônico: `pnpm pwa:prod`.

### 1.3 Hidratação Travada no Modo Dev (`next dev`)
- **Sintoma:** Aplicação permanece em estado de carregamento indefinido e console acusa bloqueio de CSP para `eval()`.
- **Causa:** O header CSP configurado em `src/middleware.ts` bloqueia `eval`, necessário para renderização de callstacks no modo de desenvolvimento do React.
- **Solução:** Utilizar `pnpm build:pwa` + `pnpm pwa:prod` para testes fiéis à produção, ou habilitar permissões de desenvolvimento adequadas no CSP quando em ambiente local.

### 1.4 Variáveis `NEXT_PUBLIC_` com Espaços Residuais
- **Sintoma:** Erros de URL inválida ao instanciar clientes HTTP no browser.
- **Causa:** Comandos `set VAR=value &&` em prompts Windows podem incluir espaços ao final da string.
- **Solução:** Definir variáveis de ambiente utilizando aspas: `set "NEXT_PUBLIC_...=https://..."`.

### 1.5 `Agent não configurado` no Assistente TED
- **Sintoma:** `agent-client.ts` lança erro informando que o Agent não está configurado ao abrir o chat TED.
- **Causa:** A variável `NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL` não foi fornecida durante o build.
- **Solução:** Realizar build fornecendo `NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL=/api/agent` (modo proxy) ou a URL canônica do Worker.

### 1.6 Erros de CORS / 403 no Login Local
- **Sintoma:** Falha de preflight CORS ou rejeição `403` ao enviar requisições de login para a API a partir de `http://127.0.0.1:3000`.
- **Solução:** Configurar `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL=/api/backend` para utilizar o proxy same-origin do Next.js, com encaminhamento de headers autenticados.

### 1.7 Autenticação do TED com Workspace Incorreto
- **Sintoma:** Requisições para o agent retornam `401` após a emissão de token de conexão.
- **Causa:** Utilização de `workspaceId` mock ou desconectado da sessão do usuário autenticado.
- **Solução:** Utilizar o `workspaceId` resolvido a partir do `useAppState` / contexto ativo da sessão.

---

## 2. Comandos Canônicos

```powershell
# 1. Build de Produção Local (Standalone)
set "NEXT_PUBLIC_PI_FINANCE_API_BASE_URL=/api/backend" && set "NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL=/api/agent" && pnpm --filter pwa build

# 2. Executar PWA Localmente
pnpm pwa:prod                 # Inicia na porta padrão 3000 (http://127.0.0.1:3000)
PORT=3002 pnpm pwa:prod       # Inicia em porta alternativa caso 3000 esteja ocupada

# 3. Executar Testes Automatizados
pnpm --filter pwa test        # Suíte de testes unitários e de integração
pnpm test:e2e                 # Suíte de testes E2E do PWA
```

---

## 3. Arquivos de Suporte ao Ambiente Local

- `scripts/start-pwa-standalone.mjs`: Script para inicialização do bundle standalone com cópia de assets.
- `apps/pwa/src/app/api/backend/[...path]/route.ts`: Rota de proxy para a API autoritativa.
- `apps/pwa/src/app/api/agent/[...path]/route.ts`: Rota de proxy para o Cloudflare Agent Worker.
