# PI Financeiro

Sistema completo de gestão financeira pessoal e familiar com assistente inteligente (TED), PWA moderno e backend server-side com isolamento por workspace/household.

## Arquitetura do Monorepo

```
.
├── apps/
│   ├── api/                # Backend autoritativo Fastify + PostgreSQL (Hostinger VPS)
│   ├── pwa/                # Aplicação PWA canônica Next.js / React (Cloudflare Pages)
│   ├── agent/              # Assistente AI com Durable Objects & Agents SDK (Cloudflare Worker)
│   └── whatsapp-bridge/    # Bridge de mensageria WhatsApp (transição de runtime)
├── docs/                   # Documentação técnica, ADRs, runbooks e planos
├── scripts/                # Automação de CI, auditoria, backup, restore e validações
└── .pi/                    # Adapters e extensões de ferramentas do assistente
```

## Stack Tecnológica

| Componente | Stack / Framework | Hospedagem / Runtime |
|---|---|---|
| **API Autoritativa** (`apps/api`) | Fastify 5, TypeScript, PostgreSQL 16 (`pg`), Kysely, Zod, Better-Auth | Hostinger VPS (`pi-stack`) |
| **PWA Web & Mobile** (`apps/pwa`) | Next.js 16, React 19, Tailwind CSS v4, Serwist | Cloudflare Pages / Workers (OpenNext) |
| **Assistente AI TED** (`apps/agent`) | Cloudflare Agents SDK, Durable Objects, SQLite | Cloudflare Workers |
| **Bridge WhatsApp** (`apps/whatsapp-bridge`) | Node.js, Fastify, Evolution API | Hostinger VPS (transição / descomissionamento) |

## Princípios de Arquitetura

1. **Fonte de Verdade Única:** `apps/api` é a única autoridade para transações, saldos, faturas e auditoria. Todas as mutações passam por endpoints autenticados e com chaves de idempotência.
2. **Isolamento por Workspace:** Todo acesso a dados é estritamente delimitado por `household_id` ou `workspace_id`.
3. **PWA Canônica:** O cliente principal do usuário é a PWA hospedada na Cloudflare (`apps/pwa`) com autenticação baseada em sessão (Better-Auth).
4. **Assistente Autenticado:** O assistente (TED) utiliza tokens delegados assinados e de curta duração emitidos pelo backend (`POST /auth/bridge-context`).

## Comandos Principais

```bash
# Instalar dependências
pnpm install

# Rodar testes em todos os workspaces
pnpm test

# Verificação estática de tipos (typecheck em todos os workspaces)
pnpm typecheck

# Validação e lint de links e documentos canônicos
pnpm docs:lint

# Validação do contrato de políticas de governança e escrita
pnpm governance:check

# Validação de readiness de cutover
npx tsx scripts/cutover-check.ts
```

## Documentação e Governança

- [Visão Geral de Produto](docs/PRODUCT.md)
- [Arquitetura Atual](docs/ARCHITECTURE-CURRENT.md)
- [Arquitetura Alvo](docs/ARCHITECTURE-TARGET.md)
- [Roadmap do Projeto](docs/ROADMAP.md)
- [Registro de Decisões de Arquitetura (ADRs)](docs/adr/README.md)
- [Runbook de Backup & Restore](docs/runbooks/backup-restore.md)

