# C-05 — Política de namespace canônico do Durable Object

**Data:** 2026-09-07
**Achado:** o Worker autorizava pelo workspace canonical mas nomeava o DO
com o id bruto do path (`idFromName(workspaceId)`), que pode ser um alias.

## Regra

Todo nome de Durable Object (`FINANCE_CHAT_AGENT`, `AGENT`) e toda chave
persistente derivada de workspace USA o `auth.workspaceId` retornado por
`authorizeWorkspaceMembership` (canonical confirmado pela autoridade).
O id bruto do path NUNCA alimenta `idFromName`, migração legada, memória,
sessão ou exportação.

- Caminho token (`x-agent-connection-token`): canonical resolvido via
  `POST /internal/workspace-alias/:id`; falha de resolução = 503
  (`agent.membership_unavailable`) — nunca fallback para o alias.
- Caminho cookie (mesma origem, legado): resolve o canonical quando
  `AGENT_AUTH_SERVICE_TOKEN` está configurado (mesmo fail-closed); sem
  service token o id segue sem resolução (degradado e registrado em log
  de auditoria do chamador).
- Quando `path-id ≠ canonical`, o Worker emite
  `do.alias_namespace_avoided` no log (observabilidade, sem PII além do id).

## Compatibilidade (DOs criados por alias)

Política explícita: **abandono com migração assistida, sem mistura
silenciosa**.

1. Namespaces derivados de alias NÃO são mais lidos nem escritos.
2. Dados presos num namespace-alias são recuperáveis via migração assistida
   de ops: `exportFullWorkspaceHistory` no DO-alias (chamada administrativa
   direta ao DO pelo nome antigo) + `importLegacyHistory` no DO-canonical,
   com conferência de contagens por workspace antes de desativar o acesso.
3. Nenhuma mistura automática: dois namespaces nunca são mesclados sem
   decisão registrada do dono do workspace.

## Verificação

`apps/agent/tests/worker-canonical-namespace.test.ts`: alias e canonical
alcançam o mesmo `idFromName(canonical)`; cross-workspace nunca toca o DO;
migração legada recebe o canonical.
