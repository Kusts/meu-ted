# Plano — Gerenciador de Workspaces e Bootstrap Resiliente

**Data:** 2026-08-29
**Origem:** auditoria técnica do estado local, `docs/`, ADRs, memória do projeto e runtime Orca.
**Status:** em execução; a primeira fatia será implementada no worktree atual.

## Objetivo

Entregar uma área própria para administrar workspaces na PWA, apoiada por contratos
consistentes na API, sem enfraquecer o isolamento por `workspace_id`/`household_id`,
autorização server-side, idempotência ou as invariantes de workspaces pessoais e
compartilhados.

Como parte da fundação, eliminar o risco de carregamento infinito no bootstrap da
PWA. A aplicação deve sempre chegar a um estado observável de sessão, conteúdo,
erro recuperável ou timeout, mesmo quando a API, IndexedDB ou migração local não
responderem.

## Estado Confirmado

- A PWA canônica é `apps/pwa/`, executando localmente em `127.0.0.1:3000`.
- `apps/pwa/.env.local` aponta para `/api/backend`; o proxy encaminha para
  `https://api.synkroo.com.br`, pois não há API local escutando em `3001`.
- O healthcheck do proxy e da API respondeu `200`; chamadas protegidas sem
  credencial responderam `401` rapidamente.
- O navegador Orca carregou a home com `Test Family` e não exibiu erros de
  console. O spinner infinito original não foi reproduzido após a inicialização.
- `WorkspaceSwitcher` funciona como seletor rápido, mas `WorkspaceSheet` não está
  integrado ao `ProfilePage` e não deve crescer até virar o produto inteiro.
- A API possui listagem/criação, membros, convites, remoção e saída parciais.
  Rename, arquivamento, convites pendentes/revogação/reenvio e uma experiência de
  transferência de ownership ainda não estão completos.
- Existem duas implementações de `createPostgresWorkspaceStore`; a implementação
  canônica deve ficar em `apps/api/src/auth/workspaces-postgres.ts`.
- A composição do servidor precisa ser verificada para que `workspaceStore`,
  `workspaceAccess`, `inviteService` e `ownershipTransferStore` alcancem as rotas
  realmente usadas em produção.
- A criação de workspace compartilhado precisa respeitar a invariável de owner de
  `V022`; o fluxo atualmente observado permite `owner_user_id` nulo.
- O worktree contém alterações preexistentes. Elas devem ser preservadas; não usar
  `git reset --hard`, `git clean`, `git checkout -- .` ou limpeza equivalente.

## Decisões

- Criar uma rota/área própria `/workspaces`; manter o switcher somente para troca
  rápida e descoberta da área de gerenciamento.
- Arquivar em vez de excluir fisicamente dados financeiros.
- Somente `owner` administra membros, convites, arquivamento e ownership.
- Manter apenas `owner` e `member` até existir necessidade comprovada de outro papel.
- Transferência de ownership exige aceitação do usuário de destino.
- O workspace ativo persistido é somente uma preferência do cliente; a API sempre
  revalida membership e autorização.
- Convites continuam usando token no fluxo seguro existente, sem transformar o
  token em dado persistido no cliente.

## Escopo da Primeira Fatia

Esta fatia inicia a implementação sem tentar concluir toda a área visual de uma
vez. Ela deve deixar a fundação da API e o bootstrap do cliente corretos e
testados, preparando a próxima fatia vertical da tela de gerenciamento.

### Fase 0 — Contrato e estabilização

1. Criar testes RED para a invariável de owner em workspace compartilhado, para o
   wiring da composição real e para a transição finita do bootstrap quando uma
   dependência fica pendente ou retorna `401`.
2. Consolidar `createPostgresWorkspaceStore` em uma única implementação sem
   apagar comportamento existente.
3. Corrigir a criação do owner/membership de workspace compartilhado e validar
   `workspace_id`/`household_id` em todas as operações alteradas.
4. Corrigir a composição efetivamente usada pelo servidor, incluindo stores e
   serviços necessários para rotas de workspace, convite e ownership.
5. Padronizar a propagação de erros de autorização e conflito, sem converter
   falhas de rede ou servidor em lista vazia.
6. Adicionar timeout/fallback recuperável ao `AuthGate`, ao carregamento de
   workspaces e ao bootstrap IndexedDB/migração, preservando sessão válida quando
   o problema for somente indisponibilidade transitória da API.

### Fase 1 — Contratos completos de workspace

1. Expandir schemas e cliente PWA com resumo de workspace, role, status, membros e
   convites pendentes.
2. Implementar rename, arquivamento reversível, listagem de convites, revogação e
   reenvio, com autorização server-side e `Idempotency-Key` nas mutações.
3. Completar endpoints e estados de transferência de ownership, mantendo a regra
   de último owner.
4. Atualizar `WorkspaceContext` para operações explícitas, estados por operação,
   erros visíveis e preferência segura do workspace ativo.

### Fase 2 — Área de gerenciamento PWA

1. Criar `/workspaces` com layout responsivo: lista e detalhes em desktop, fluxo
   vertical/abas em telas pequenas.
2. Integrar a navegação pelo perfil e pelo dropdown do switcher.
3. Implementar criação de workspace pessoal/compartilhado, edição, membros,
   convites, saída, arquivamento e ownership com confirmações adequadas.
4. Cobrir estados vazios, loading, erro, conflito, permissão insuficiente e
   workspace arquivado.
5. Preservar a linguagem visual existente da PWA, incluindo o switcher hero já
   validado.

### Fase 3 — Verificação e rollout

1. Adicionar testes de contrato, integração, autorização e concorrência.
2. Validar isolamento cross-workspace, workspace pessoal, último owner, convite
   repetido e falhas parciais de API/IndexedDB.
3. Executar validação visual no Orca em mobile, tablet e desktop.
4. Rodar `pnpm docs:lint`, `pnpm typecheck`, `pnpm test` e
   `pnpm governance:check`, registrando qualquer falha preexistente separadamente.
5. Manter o switcher antigo como fallback até a nova área estar validada.

## Critérios de Aceite

- Workspace compartilhado sempre cria e persiste seu owner/membership válido.
- Nenhuma rota alterada permite acesso ou mutação fora do workspace autorizado.
- A composição de produção registra os serviços necessários para os fluxos
  implementados; não existem stores duplicados competindo em runtime.
- API lenta, API indisponível, `401`, IndexedDB pendente e migração com erro não
  deixam a PWA em loading infinito.
- O cliente diferencia loading, sucesso, vazio, erro recuperável e sessão inválida.
- A área `/workspaces` permite ao owner administrar o ciclo de vida previsto e ao
  member apenas as operações permitidas.
- Todos os novos comportamentos possuem teste automatizado, começando por RED e
  terminando em GREEN.
- Os gates do projeto passam ou possuem falhas anteriores claramente isoladas.

## Arquivos Prováveis

- `apps/api/src/auth/workspaces-http.ts`
- `apps/api/src/auth/workspaces-postgres.ts`
- `apps/api/src/auth/workspace-access.ts`
- `apps/api/src/auth/invites-http.ts`
- `apps/api/src/auth/invites-postgres.ts`
- `apps/api/src/auth/ownership-transfers-http.ts`
- `apps/api/src/auth/ownership-transfers-postgres.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/server/index.ts`
- `apps/api/src/server/production-routes.ts`
- `apps/api/src/routes/route-inventory.ts`
- `apps/api/tests/auth/workspaces-http.test.ts`
- `apps/api/tests/integration/postgres-workspaces.test.ts`
- `apps/pwa/src/features/auth/AuthGate.tsx`
- `apps/pwa/src/lib/auth/workspace-context.tsx`
- `apps/pwa/src/lib/api/client.ts`
- `apps/pwa/src/lib/api/workspaces.ts`
- `apps/pwa/src/lib/api/schemas.ts`
- `apps/pwa/src/lib/state/app-state-context.tsx`
- `apps/pwa/src/lib/state/sync-engine.ts`
- `apps/pwa/src/lib/session.ts`
- `apps/pwa/src/components/WorkspaceSwitcher.tsx`
- `apps/pwa/src/features/profile/WorkspaceSheet.tsx`
- `apps/pwa/src/features/profile/ProfilePage.tsx`

## Riscos e Rollback

- Alterações em composição podem afetar autenticação e rotas financeiras; validar
  primeiro com testes isolados e integração antes de qualquer deploy.
- A API real está atrás do proxy local; não usar dados de produção como substituto
  de teste automatizado nem executar mutações reais durante a validação.
- O working tree já está sujo; revisar `git diff` por arquivo e alterar somente o
  escopo da task.
- Rollback da primeira fatia: reverter somente os arquivos listados no diff da
  task, preservando alterações preexistentes e o plano/documentação.

## Ordem de Execução Atual

1. Coder AGY cria os testes RED e confirma as falhas esperadas.
2. Coder implementa a Fase 0 até os testes focados ficarem GREEN.
3. Planner revisa diff, contratos, isolamento e evidências.
4. Coder implementa a primeira tela/integração da Fase 2 em uma nova task no
   mesmo terminal, após a fundação ser validada.
5. Planner executa os gates e decide se o resultado está completo ou parcial.
