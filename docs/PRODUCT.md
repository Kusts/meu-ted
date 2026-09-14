# Meu Ted — Visão de produto

**Last verified:** 2026-09-13
**Reference:** [`runtime-facts.json`](architecture/runtime-facts.json)

## Propósito

Meu Ted ajuda pessoas e famílias a organizar contas, transações, cartões,
orçamentos e metas. A PWA é a interface canônica; a API autoritativa preserva
integridade, auditoria e isolamento por workspace.

## Usuários e acesso

- **Membro:** consulta dados e prepara operações dentro do seu workspace.
- **Owner/administrador:** administra o workspace e convites conforme as
  permissões da API.
- **TED:** co-piloto conversacional. Ele pode explicar dados atuais e preparar
  propostas, mas não ganha autoridade financeira própria.

## TED V2

O TED recebe uma mensagem autenticada, a normaliza no pipeline V2 e usa
evidências atuais da API. Para uma mutação, ele apresenta uma proposta e a PWA
envia somente a decisão para o Agent. A API confirma e executa a operação
vinculada; a interface informa sucesso exclusivamente após `succeeded`.

Memória conversacional melhora contexto, mas nunca substitui saldos, extratos,
identidade ou permissões atuais. Na ausência de evidência, confirmação ou
capability, o TED falha fechado e pede esclarecimento.

## Recursos

1. Contas, saldos, receitas, despesas e transferências em centavos inteiros.
2. Cartões, faturas, parcelamentos e contas a pagar.
3. Orçamentos, metas, alertas e auditoria de mutações.
4. TED em painel/global chat com proposta, confirmação, cancelamento e estado
   seguro de pending operation.
