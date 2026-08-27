# Research & Spike: OpenAI Codex Subscription Candidate Provider

**Data:** 2026-08-26  
**Status:** `experimental_blocked` (Decisão de Gate)  
**Autor:** Antigravity Coder & OpenCode Planner  
**Escopo:** Avaliação do candidato `openai-codex-subscription` com transporte de broker privado e auth mode `chatgpt-browser` (Task 1 Steps 7 & 8).

---

## 1. Contexto e Objetivos

O plano de suporte a múltiplos LLMs no TED (`docs/superpowers/plans/2026-08-26-agents-sdk-chat-workspaces-llm-config.md`) estabelece que o sistema deve suportar provedores de inferência de forma auditável e segura.

Diferenças essenciais entre os provedores avaliados:
1. **`openai-api`**: Usa OpenAI Platform API key direta, com cobrança por token via API oficial, autenticação direta no Worker Cloudflare sem compartilhamento de credencial de usuário, e total conformidade com chamadas estruturadas de tool calls (`@ai-sdk/openai`).
2. **`opencode-zen` / `opencode-go`**: Provedores de API direta via Cloudflare Workers com keys seguras provisionadas via Wrangler secrets.
3. **`openai-codex-subscription` (Candidato)**: Proposta de utilização de assinatura de usuário/entitlement ChatGPT/Codex via broker privado na VPS.

---

## 2. Critérios de Avaliação e Resultados do Spike (Step 7)

### 2.1 Chamada Headless e Isolamento de Ferramentas
- O cliente oficial Codex CLI/SDK em modo headless foi inspecionado.
- Enquanto o `codex exec` permite execução interativa local, sua utilização como backend multiusuário compartilhado sem containerização e sem isolamento estrito introduz superfícies de ataque que violam os requisitos de segurança financeira.
- Ferramentas nativas de shell/filesystem/network do runner precisariam ser sanitizadas ou estritamente removidas para impedir execução de comandos não autorizados.

### 2.2 Isolamento de Credenciais e Canary Test
- Um canary token (`CANARY_SECRET_DO_NOT_LEAK_*`) foi avaliado no ambiente do broker adjacente ao cache de autenticação (`0600`).
- O cache autenticado por browser flow (`chatgpt-browser`) contém tokens de sessão de usuário pessoal e não pode ser exposto à borda, PWA ou logs.
- Qualquer vazamento de cookies ou tokens OAuth de sessão pessoal desqualifica o transporte.

### 2.3 Suporte a Function Tools / Tool Calling Estruturado
- O AI SDK exige `function` calling determinístico com schema JSON rigoroso para mutações financeiras autoritativas.
- Modelos expostos via sessões de chat interativo sem API de function calling oficial degradam para parsing livre de texto, o que é expressamente proibido pela regra arquitetural: *"Nunca simular paridade por parsing livre de texto"*.

---

## 3. Decisão do Gate de Termos e Licenciamento (Step 8)

Conforme a regra do Step 8:
> *"Exigir evidência escrita da OpenAI ou contrato empresarial que permita o uso multiusuário pretendido; aprovação interna do owner, probe verde ou sucesso técnico não substituem essa evidência. Se function tools, isolamento, autorização de uso ou operação segura não forem comprovados, manter `openai-codex-subscription` hard-coded como `experimental_blocked`, encerrar sua trilha e continuar a entrega com `openai-api` e OpenCode Zen/Go."*

### Veredito:
1. **Ausência de Contrato Empresarial Escrito de Multitenancy**: Não há evidência contratual formal da OpenAI que autorize o uso compartilhado multi-tenant de assinaturas pessoais de ChatGPT/Codex através de um proxy/broker automatizado.
2. **Classificação de Elegibilidade**: `openai-codex-subscription` permanece hard-coded no schema e stores da API como **`eligibility: 'experimental_blocked'`**.
3. **Impedimento de Ativação**: A API rejeita qualquer tentativa de ativação deste provedor no banco e nos endpoints administrativos, independentemente da interface do usuário.
4. **Continuidade da Entrega**: A implementação de produção continuará focada em **`opencode-zen`**, **`opencode-go`** e **`openai-api`**, que possuem transporte direto, chaves de API oficiais e total conformidade com o modelo de segurança do Cloudflare Agents SDK.
