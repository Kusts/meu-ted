import type { Skill } from './types.js';

export const contasCartoesSkill: Skill = {
  name: 'contas-cartoes',
  title: 'Contas e cartões',
  when: 'criar conta, gerenciar cartão, ver fatura ou pagar fatura',
  keywords: [
    'cartão', 'cartao', 'fatura', 'faturas', 'vencimento', 'fechamento', 'limite',
    'conta nova', 'criar conta', 'banco', 'nubank', 'itaú', 'itau', 'inter',
    'crédito', 'credito', 'débito', 'debito', 'desativar conta',
  ],
  tools: [
    'list_accounts',
    'create_account',
    'update_account',
    'deactivate_account',
    'create_credit_card_account',
    'list_statements',
    'get_statement_details',
    'create_card_purchase',
    'list_recurring_purchases',
    'create_recurring_purchase',
    'pay_statement',
  ],
  steps: [
    'Fatura: leia list_statements e detalhe com get_statement_details (total, vencimento, itens).',
    'Pagar fatura é mutação com approval: explique valor, conta de origem e vencimento, confirme, execute com pay_statement.',
    'Fechamento vs vencimento: a compra após o fechamento cai na próxima fatura — explique isso ao responder "posso comprar?".',
    'Nova conta/cartão: confirme nome, tipo e (no cartão) limite e dias de fechamento/vencimento.',
    'Desativar conta com lançamentos é bloqueado — oriente a mover ou encerrar as pendências primeiro.',
  ],
  pitfalls: [
    'Nunca pague fatura sem confirmar valor e conta de origem.',
    'Não confunda fechamento (vira a fatura) com vencimento (dia de pagar).',
  ],
};
