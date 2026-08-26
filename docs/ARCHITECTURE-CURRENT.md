# PI Financeiro — Arquitetura Atual

**Last verified:** 2026-08-23  
**Reference:** [`runtime-facts.json`](architecture/runtime-facts.json)  

## 1. Visão Geral da Topologia

A arquitetura do PI Financeiro opera em modelo híbrido entre Borda (Cloudflare) e Servidor Autoritativo (Hostinger VPS). O frontend PWA e o assistente AI rodam na Cloudflare, enquanto a API autoritativa e o banco de dados relacional PostgreSQL 16 residem na VPS.

```mermaid
graph TD
    User([Usuário]) --> PWA[PWA - apps/pwa<br/>Cloudflare Pages / OpenNext]
    User --> WhatsApp[WhatsApp Messaging<br/>(Transição P3)]
    WhatsApp --> Bridge[whatsapp-bridge<br/>Hostinger VPS]
    Bridge --> Agent[Agent Worker - apps/agent<br/>Cloudflare Workers / DO]
    PWA --> API[Fastify API - apps/api<br/>Hostinger VPS pi-stack]
    Agent --> API
    API --> Postgres[(PostgreSQL 16 DB<br/>Hostinger VPS)]
```

## 2. Componentes e Responsabilidades

- **`apps/api` (Fastify 5 + PostgreSQL 16 + Better-Auth):**
  - Única fonte da verdade para o domínio financeiro, mutações e consistência contábil.
  - Autenticação de usuários via Better-Auth (email/senha, sessões e convites administrativos).
  - Controle estrito de isolamento por `workspace_id` e `household_id` com suporte a chaves de idempotência.
  - Camada de migrações SQL versionadas (V001 a V033), suportando esquemas legados e canônicos.
- **`apps/pwa` (Next.js 16 + React 19 + Tailwind CSS v4 + Serwist):**
  - Cliente canônico web/mobile com suporte offline para leitura de cache e service worker para assets e notificações.
  - Tela de autenticação baseada em credenciais (email e senha), persistência síncrona de token e emissão subordinada de dispositivo.
  - Comunicação HTTP autoritativa direta com a API (`https://api.synkroo.com.br`).
- **`apps/agent` (Cloudflare Workers + Agents SDK + Durable Objects):**
  - Assistente conversacional inteligente (TED) com persistência de estado em SQLite local no Durable Object.
  - Execução de ferramentas financeiras geradas via OpenAPI e autenticação por tokens delegados de curta duração (`POST /auth/bridge-context`).
- **`apps/whatsapp-bridge` (Node.js + Fastify + Evolution API):**
  - Bridge transitório de mensageria em fase final de desligamento (Fase P3 / checkpoint T+36h do gate de 48h).

## 3. Segurança, Identidade & Migrações Recentes

- **Autenticação com Better-Auth (V017, V019, V031):**
  - Estrutura completa de tabelas de usuário, conta, sessão e papéis administrativos (`role`, `banned`, `issuer`).
  - Suporte a preflight CORS (respostas `204` em `/auth/*`) e transporte de cookies com `credentials: 'include'`.
- **Evolução do Schema e Cartões (V032, V033):**
  - Suporte a `household_id` em compras legadas de cartão (`V032`) e fluxo transacional de cancelamento de compras (`V033`).
- **Isolamento e Idempotência:**
  - Garantia de que nenhuma requisição ou agente acesse registros fora do workspace associado.
  - Mutações protegidas contra repetição acidental via `Idempotency-Key` e tabela `idempotency_keys`.

