# Agent History Migration Runbook

Este runbook orienta a migração segura, não-destrutiva e idempotente de históricos de conversa do assistente financeiro do modelo legado (`WorkspaceAgent`) para o modelo canônico (`FinanceChatAgent`).

---

## 1. Princípios de Segurança e Governança

1. **Não-Destrutivo**: A migração realiza apenas leitura no `WorkspaceAgent`. Os dados e esquemas antigos permanecem intactos.
2. **Idempotência por Hash**: Cada conjunto de mensagens migrado gera um hash SHA-256 persistido na tabela de controle `_history_migration_marker`. Execuções subsequentes com o mesmo hash são puladas imediatamente (`already_migrated`) sem duplicações.
3. **Destino SDK Canônico**: As mensagens migradas são transformadas em `UIMessage` (partes de texto com metadados do servidor `actorId`, `workspaceId`, `createdAt`) e persistidas via `AIChatAgent.persistMessages` / `this.messages`, sem criar tabela SQLite manual de `migrated_messages`.
4. **Preservação de Autoria e Sanitização**: A autoria de cada mensagem (`user-a`, `user-b`, `ted`) é mantida estritamente associada ao `actor_id` original, e todo o conteúdo passa por `redactTranscript` e sanitização de segurança.
5. **Isolamento de Execução em Voo**: Nenhum histórico é migrado se existirem turnos nos estados `queued` ou `running`.
6. **Zero Dados Sensíveis no Cliente**: A orquestração ocorre diretamente entre os stubs dos Durable Objects no Cloudflare Worker (`AGENT` $\to$ `FINANCE_CHAT_AGENT`) após a autorização do workspace, sem transmissão de payloads legados pelo navegador.

---

## 2. Procedimento de Migração

### Passo 1: Pré-validação e Verificação de Turnos em Voo
Antes da importação, o sistema verifica se o workspace possui turnos pendentes:
```sql
SELECT count(*) FROM turn_queue WHERE status IN ('queued', 'running');
```
*Se a contagem for > 0, o processo é abortado com `migration_blocked_turns_in_flight` até a conclusão dos turnos.*

### Passo 2: Execução da Migração via RPC Interno
O Worker orquestra a exportação e importação entre stubs de Durable Objects:
```ts
const exportData = await legacyAgent.exportFullWorkspaceHistory();
const result = await financeChatAgent.importLegacyHistory(exportData);
```

### Passo 3: Verificação Pós-Migração
Confirme a gravação do marcador de migração no SQLite do `FinanceChatAgent`:
```sql
SELECT * FROM _history_migration_marker WHERE workspace_id = '<WORKSPACE_ID>';
```
E a listagem cronológica do histórico via endpoint autenticado:
```http
GET /agents/finance-chat-agent/<WORKSPACE_ID>/rpc/history
```

---

## 3. Status Local Validado (2026-08-30)

**Estado:** a implementação local está concluída e validada; não houve deploy, migração real de histórico, nem E2E com contas reais.

### Implementado

1. O Worker autoriza o workspace antes de encaminhar somente os endpoints canônicos `POST /rpc/chat` e `GET /rpc/history` do `FinanceChatAgent`.
2. A PWA usa o histórico autoritativo retornado pelo servidor, exige `isOwn`, oculta `actorId` bruto e exibe nomes humanos para TED, o usuário atual e outros membros.
3. Falhas de carregamento ou envio exibem mensagens genéricas, sem detalhes internos de token ou transporte.
4. O painel secundário de histórico descarta respostas atrasadas de outro workspace e limpa dados que não puderam ser confirmados.
5. Os controles de exportação e exclusão do transcript não são expostos nas superfícies ativas enquanto não houver política de produto e autorização definida.

### Evidências desta validação

- `pnpm docs:lint` aprovado.
- `pnpm typecheck` aprovado para API, PWA, Agent e Codex Broker.
- `pnpm governance:check` aprovado.
- `pnpm test` aprovado: API com 128 arquivos e 915 testes; PWA com 102 arquivos e 1028 testes.
- `git diff --check` aprovado.

## 4. Próximos Passos de Retomada

1. Executar E2E local com dois membros de um workspace compartilhado: autoria `isOwn`, nomes de membros, troca de workspace e recarga do histórico canônico.
2. Antes de qualquer deploy, conferir bindings e secrets do Worker/Cloudflare sem imprimir valores sensíveis; não tratar processos locais do Windows como produção.
3. Para uma migração real, seguir as seções 1 e 2 deste runbook por workspace: confirmar ausência de turnos em voo, executar RPC interno, verificar o marcador e conferir o endpoint autenticado.
4. Definir a política de produto, autorização e auditoria para eventual exportação ou exclusão de transcript antes de reintroduzir controles na PWA.

## 5. Procedimento de Rollback

Como o `WorkspaceAgent` opera em modo estritamente somente-leitura durante a migração, o rollback é 100% não-destrutivo:
1. Manter ou reverter o roteamento para o adaptador legado (`/agents/workspace/:workspace/message`).
2. Caso seja necessário limpar o marcador de migração no novo DO:
```sql
DELETE FROM _history_migration_marker WHERE workspace_id = '<WORKSPACE_ID>';
```
