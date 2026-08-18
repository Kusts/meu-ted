# G2.2.5 — Unit of Work para mutações financeiras compostas

## Objetivo

Garantir que cada mutação financeira que produz efeitos em mais de uma tabela execute todos os efeitos em uma única transação PostgreSQL. Qualquer falha após o primeiro efeito deve fazer rollback completo, sem estado parcial.

## Escopo

Adapters canônico e legacy dos seguintes fluxos:

- `PayableStore.markPayablePaid`: marca a conta, cria o lançamento, vincula o lançamento e agenda a próxima recorrência quando aplicável.
- `PayableStore.undoPayablePayment`: desfaz o pagamento e soft-deleta o lançamento vinculado.
- Criação de payable com template no mesmo comando: payable e template devem compartilhar a Unit of Work.
- `CardStore.createCardPurchase`: valida conta/categoria, cria ou encontra fatura, cria compra e recalcula total/status.
- `CardStore.createCardInstallments`: preservar e verificar sua transação já existente.
- `CardStore.payStatement`: preservar e verificar sua transação já existente.
- `CardStore.updatePurchase`: atualiza compra e recalcula a fatura na mesma transação.
- `CardStore.updateCard`: atualização do cartão usa a mesma fronteira transacional dos demais mutators Postgres.
- `CardStore.createRecurringPurchase`: valida referências e persiste a recorrência dentro da Unit of Work.
- `GoalStore.contributeToGoal`: atualiza acumulado/status da meta e insere a contribuição na mesma transação.

Operações de uma única escrita continuam simples, mas podem usar o mesmo helper quando a validação de referência fizer parte da invariável da operação. Stores em memória preservam comportamento atual, que é síncrono e não expõe conexão parcial.

## Arquitetura

`withTransaction(pool, callback)` permanece a única fronteira de transação. O `AsyncLocalStorage` já existente permite que chamadas aninhadas reutilizem o mesmo `PoolClient`; nenhum método composto usará `pool.query` para uma parte da operação e `client.query` para outra.

Cada adapter terá helpers internos que recebem `PoolClient` quando necessário. O método público abre a Unit of Work e executa validações, efeitos, recálculos e leitura de retorno nela. O contrato público dos stores permanece estável, exceto por um método explícito de comando composto para criação de payable com template, usado pela rota que atualmente chama dois métodos independentes.

A idempotência existente continuará envolvendo o producer por fora: claim, Unit of Work financeira, auditoria e conclusão permanecem na mesma conexão no adapter canônico. O producer não abrirá uma segunda transação.

## Invariantes

1. Toda escrita composta usa exatamente um `BEGIN` e um `COMMIT` em sucesso.
2. Qualquer exceção dispara `ROLLBACK` e é relançada.
3. Nenhum efeito de outro household pode ser incluído por queries sem `household_id`.
4. Recalculo de fatura ocorre antes do commit.
5. Pagamento de payable e próxima ocorrência recorrente são atômicos com o lançamento.
6. Contribuição de goal nunca deixa o acumulado atualizado sem a linha de contribuição.
7. A rota de payable com template nunca deixa apenas um dos dois registros.

## Testes

- Adicionar testes de contrato/unitários que observem `BEGIN`, `COMMIT` e `ROLLBACK` nos adapters.
- Adicionar integração Postgres canônica e legacy para sucesso e falha injetada após o primeiro efeito de cada família.
- Verificar contagens e valores nas tabelas relacionadas após rollback: `accounts_payable`, `transactions`, `statements`, `recurring_purchases`, `goals`, `goal_contributions` e `payable_templates`.
- Verificar edição de cartão canônica e legacy: falha não altera o nome/limite persistido.
- Manter os testes existentes de isolamento household, idempotência, typecheck e `git diff --check`.

## Fora de escopo

- Alteração do modelo de autenticação/membership.
- Migração de schema não necessária para a Unit of Work.
- Redesenho das interfaces de leitura.
- Commit, deploy ou alteração de produção sem autorização explícita.
