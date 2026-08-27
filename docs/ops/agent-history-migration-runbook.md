# Agent History Migration Runbook

Este runbook orienta a migração segura, não-destrutiva e idempotente de históricos de conversa do assistente financeiro do modelo legado (`WorkspaceAgent`) para o modelo canônico (`FinanceChatAgent`).

---

## 1. Princípios de Segurança e Governança

1. **Não-Destrutivo**: A migração realiza apenas leitura no `WorkspaceAgent`. Os dados e esquemas antigos permanecem intactos.
2. **Idempotência por Hash**: Cada conjunto de mensagens migrado gera um hash SHA-256 persistido na tabela `_history_migration_marker`. Execuções subsequentes identificam o hash e não duplicam registros.
3. **Preservação de Autoria Multiatorm**: A autoria de cada mensagem (`user-a`, `user-b`, `agent`) é mantida estritamente associada ao `actor_id` original.
4. **Isolamento de Execução em Voo**: Nenhum histórico é migrado se existirem turnos nos estados `queued` ou `running`.
5. **Zero Dados Sensíveis no Cliente**: O fluxo de migração ocorre internamente entre Durable Objects sem expor mensagens no navegador.

---

## 2. Procedimento de Migração

### Passo 1: Pré-validação e Verificação de Turnos em Voo
Antes de iniciar, confirme que o workspace não possui operações pendentes:
```sql
SELECT count(*) FROM turn_queue WHERE status IN ('queued', 'running');
```
*Se a contagem for > 0, aguarde a conclusão dos turnos antes de prosseguir.*

### Passo 2: Execução da Migração Interna
A chamada RPC interna executa a exportação completa e inserção atômica:
```ts
const exportData = await workspaceAgent.exportFullWorkspaceHistory();
const result = migrateLegacyHistory(exportData, financeChatAgent.storage.sql);
```

### Passo 3: Verificação Pós-Migração
Confirme a gravação do marcador de migração:
```sql
SELECT * FROM _history_migration_marker WHERE workspace_id = '<WORKSPACE_ID>';
```
E a contagem de mensagens importadas:
```sql
SELECT count(*) FROM migrated_messages WHERE workspace_id = '<WORKSPACE_ID>';
```

---

## 3. Procedimento de Rollback

Como o `WorkspaceAgent` opera em modo somente-leitura durante a migração, o rollback consiste unicamente em manter as rotas direcionadas ao DO anterior (`AGENT`).
Caso seja necessário reverter os registros importados no novo DO:
```sql
DELETE FROM migrated_messages WHERE workspace_id = '<WORKSPACE_ID>';
DELETE FROM _history_migration_marker WHERE workspace_id = '<WORKSPACE_ID>';
```
