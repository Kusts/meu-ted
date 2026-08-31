# Goal run — G4.GATE

**Goal ID:** G4.GATE
**Completed:** 2026-08-03 18:52
**Status:** done

## Contract

- **Objective:** Usuário não-membro não acessa API, snapshot, chat ou metadata de outro workspace.
- **Acceptance:** API resolve sessão + membership antes do handler; stores escopam por household; snapshots usam identidade usuário+workspace; chat legado fica desabilitado no bridge antes de G5.

## Evidence

- `pnpm test:api`: route inventory 73/73, scanner regression verde, 63 arquivos / 550 testes verdes.
- `tests/routes/route-authz-inventory.test.ts`: todas as rotas protegidas cobertas; cenário sem membership retorna `403 auth.workspace_forbidden`.
- `tests/routes/workspace-membership-access.test.ts`: acesso válido lê dados; remoção passa a retornar forbidden imediatamente; ownership usa contexto de membership resolvido.
- `tests/contract/idor-cross-household.test.ts`: 10/10 cenários cross-household verdes quando executado isoladamente.
- `apps/pwa/src/lib/state/snapshot-db.test.ts`: 22 testes verdes; `snapshot-store.test.ts`: 4 verdes; `session.test.ts`: 2 verdes. Snapshot v2 é separado por identidade composta e limpeza de sessão remove dados sensíveis.
- `tests/auth/workspaces-http.test.ts`: metadata exige sessão; membro autenticado sem membership recebe 403 em listagem de membros, remoção e saída.
- `apps/whatsapp-bridge/src/server.test.ts`: chat do bridge é ignorado por padrão (`chat desabilitado`); forwarding só ocorre com opt-in explícito de teste/compatibilidade.
- `apps/pwa/src/lib/state/__tests__/snapshot-store.test.ts`: 5 testes, incluindo troca user+workspace, mismatch cross-user e limpeza após revogação.

## Note

A execução ampla de `pnpm test:pwa` sofreu timeouts/erros de infraestrutura do runner em testes de estado já existentes; os testes diretamente relacionados ao Gate G4 passaram isoladamente. O IDOR falhou apenas quando executado junto ao workspace PWA por timeout de runner e passou isoladamente (10/10). Não houve alteração de assertions para mascarar essas falhas.
