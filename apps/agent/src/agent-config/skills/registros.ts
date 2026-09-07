import type { Skill } from './types.js';

export const registrosSkill: Skill = {
  name: 'registros',
  title: 'Lançamentos (receitas, despesas, parcelas)',
  when: 'criar, consultar, editar ou excluir um lançamento, incluindo parcelados',
  keywords: [
    'lanç', 'gasto', 'gastei', 'despesa', 'receita', 'recebi', 'registr', 'anotar',
    'parcela', 'parcel', 'compra', 'paguei', 'pagar', 'editar', 'corrigir', 'excluir',
    'apagar', 'reembolso', 'pix', 'boleto',
  ],
  tools: [
    'create_expense',
    'create_income',
    'create_transfer',
    'update_transaction',
    'delete_transaction',
    'undo_last_action',
    'list_recent_transactions',
    'create_card_purchase',
    'create_card_installments',
    'detect_duplicate',
  ],
  steps: [
    'Entenda o que a pessoa quer: valor, descrição, data e onde caiu (conta ou cartão).',
    'Conta XOR cartão: lançamento em conta usa create_expense/create_income com accountId; compra no cartão usa create_card_purchase com accountId do cartão. Nunca os dois.',
    'Parcelado no cartão: use create_card_installments (valor total + número de parcelas), não N lançamentos manuais.',
    'Antes de criar, confira duplicidade com detect_duplicate quando houver risco (mesmo valor e data próxima).',
    'Para editar ou excluir, localize primeiro com list_recent_transactions e confirme o lançamento certo pela descrição e data.',
    'Responda com o essencial: o que foi registrado, onde e o valor — sem IDs técnicos.',
  ],
  pitfalls: [
    'Nunca crie lançamento sem valor e descrição confirmados.',
    'Nunca misture accountId de conta com fluxo de cartão.',
    'Edição/exclusão e pagamento exigem confirmação explícita (ver política de mutações).',
  ],
};
