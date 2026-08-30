# Cancelamento auditável de compras no cartão

## Objetivo
Permitir cancelar uma compra de cartão sem apagar evidências financeiras, removendo-a das faturas e listagens ativas e preservando histórico auditável.

## Escopo
- Adicionar `DELETE /cards/purchases/:id`.
- Marcar a compra de cartão como cancelada por exclusão lógica.
- Aplicar exclusão lógica à transação financeira vinculada.
- Recalcular o total da fatura na mesma unidade de trabalho.
- Criar vínculo explícito entre `card_purchases` e `transactions` para novas compras.
- Tratar compras legadas sem vínculo somente quando a associação for única e segura.

## Fora de escopo
- Exclusão física de compras, transações ou faturas.
- Cancelamento de fatura paga, parcial ou vencida.
- Alteração retroativa de parcelamentos já liquidados.
- Limpeza direta por SQL de dados E2E.

## Modelo de dados
A migration aditiva seguinte à V032 adicionará:

- `card_purchases.transaction_id UUID NULL`
- `card_purchases.deleted_at TIMESTAMPTZ NULL`

Novas compras gravarão `transaction_id` da transação criada pela mesma unidade de trabalho. A migration criará chave estrangeira para `transactions(id)` com `ON DELETE RESTRICT`; transações são soft-deletadas, portanto o vínculo de auditoria permanece íntegro. Um índice parcial atenderá compras ativas por fatura e household.

## API
### `DELETE /cards/purchases/:id`

Pré-condições:
- A compra pertence ao household autenticado.
- A compra ainda está ativa.
- A fatura está aberta.

Sucesso:
- HTTP 204.
- Marca `card_purchases.deleted_at`.
- Marca a transação vinculada com `deleted_at`.
- Recalcula `statements.total_cents` usando apenas transações ativas.

Idempotência:
- Uma segunda chamada para a mesma compra cancelada retorna HTTP 204 sem nova mutação.

Erros:
- 404: compra inexistente ou de outro household.
- 409: fatura não está aberta, vínculo legado é ambíguo ou não há transação correspondente segura.

## Compatibilidade legada
Compras anteriores à migration não terão `transaction_id`.

Ao cancelar uma compra legada, o serviço busca transação ativa com o mesmo household, statement, conta, valor e data. A associação só é aceita quando há exatamente uma candidata. Zero ou múltiplas candidatas retornam 409 sem cancelar nenhuma entidade. Não há heurística de melhor esforço.

## Leitura e auditoria
- Consultas de compras e detalhes de fatura filtram `card_purchases.deleted_at IS NULL`.
- Consultas financeiras existentes continuam filtrando `transactions.deleted_at IS NULL`.
- Registros cancelados permanecem no banco para auditoria e não voltam ao total da fatura.

## Testes
1. Cancela compra nova vinculada e reduz o total da fatura.
2. Segunda chamada é idempotente.
3. Não permite cancelar compra de outro household.
4. Não permite cancelar compra de fatura fechada/paga.
5. Compra legada com uma transação candidata é cancelada corretamente.
6. Compra legada com zero ou múltiplas candidatas retorna 409 e preserva dados.
7. Listagem e detalhe de fatura ocultam compras canceladas.
8. Cenário E2E cria, cancela e confirma baseline restaurado sem SQL direto.

## Rollout e rollback
A migration é apenas aditiva. O deploy deve executar migration, testar a rota com dados E2E isolados e verificar saldo/fatura. O rollback de aplicação é seguro porque novas colunas não são exigidas por versões anteriores; as colunas não devem ser removidas automaticamente.
