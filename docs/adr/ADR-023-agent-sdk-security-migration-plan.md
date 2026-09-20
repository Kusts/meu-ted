# ADR-023 — Migração controlada do Agents SDK e AI SDK para correção de superfície de segurança

**Status:** Aceito
**Data:** 2026-09-19

## Contexto

O Agent TED está resolvido em `agents@0.2.35` e `ai@5.0.248`. A árvore também
contém `@cloudflare/ai-chat@0.1.9`, cujos peers atuais pedem
`agents@^0.7.6` e `ai@^6.0.0`. A atualização corrige vulnerabilidades e
elimina incompatibilidades de peers, mas é breaking para Durable Objects,
streaming e contratos de tools; não é atualização segura de rotina.

A revisão atual não encontrou binding de email em
`apps/agent/wrangler.jsonc`, nem código em `apps/agent/src/` que use handlers
ou resolver de entidades de email. Portanto, a superfície reportada pelo
advisory de resolver de email não é alcançável pela configuração entregue hoje.
Isso reduz a urgência, mas não substitui a migração.

## Decisão

1. **Não atualizar Agents/AI SDK in-place nesta entrega.** Manter
   `agents@0.2.x` e `ai@5.x` até uma migração dedicada, com canário, rollback
   e validação de Durable Object.
2. **Controles compensatórios obrigatórios até a migração.** Não adicionar
   binding de email, handler de email ou resolver de entidade de email ao
   Agent TED na linha atual. Todo novo binding ou mecanismo de ingestão exige
   reabrir este ADR e completar a migração antes da exposição.
3. **Plano da migração.** A frente dedicada deve atualizar em conjunto
   `agents@0.7.6+`, `ai@6+`, `@cloudflare/ai-chat` e peers compatíveis;
   revisar APIs de `AIChatAgent`, persistência/SQLite do DO, streaming,
   RPCs autenticados, tools e tipos Cloudflare. Ela não deve resolver peers
   apenas com `--force` ou overrides incompatíveis.
4. **Gates de entrega.** Antes de promover o canário: typecheck, suites do
   Agent, contrato de aprovação/undo, build do Worker, smoke autenticado de
   chat/RPC e verificação de reidratação após restart do DO. A promoção exige
   métrica sem erros novos e rollback para a versão anterior disponível.

## Consequências

- O warning de peer de `@cloudflare/ai-chat` continua conhecido e rastreado;
  não é aceito como evidência de compatibilidade.
- O upgrade de `wrangler@4.135.0` permanece separado e foi validado pelo
  typecheck atual; não autoriza mudar os SDKs do Agent.
- A primeira mudança que introduzir email, ingestão externa ou novo binding
  no Agent bloqueia até a migração ou nova decisão de segurança.

## Referências

- `apps/agent/package.json` (versões declaradas).
- `apps/agent/wrangler.jsonc` (bindings ativos).
- `apps/agent/src/` (sem referência atual a email/resolver).
- `pnpm-lock.yaml` (peers resolvidos e incompatibilidades atuais).
