import type { Skill } from './types.js';

export const compromissosSkill: Skill = {
  name: 'compromissos',
  title: 'Contas a pagar, pendências e assinaturas',
  when: 'contas a pagar, vencimentos, aprovações pendentes e recorrências',
  keywords: [
    'a pagar', 'contas a pagar', 'vencendo', 'vence', 'vencido', 'atrasado', 'conta de', 'pendente',
    'pendência', 'pendencia', 'aprovação', 'aprovacao', 'aprovar', 'assinatura',
    'recorrente', 'recorrência', 'mensalidade', 'aluguel', 'marcar como pago',
    'dei baixa', 'baixar',
  ],
  tools: [
    'list_accounts_payable',
    'create_account_payable',
    'mark_account_paid',
    'cancel_account_payable',
    'create_payable_template',
    'list_payable_templates',
    'create_payable_from_template',
    'auto_create_from_templates',
    'refresh_payable_status',
    'check_payable_reminders',
    'list_notifications',
    'configure_notification',
  ],
  steps: [
    'Liste o que está pendente com list_accounts_payable antes de afirmar qualquer vencimento.',
    'Dar baixa (mark_account_paid) e cancelar são mutações com approval: confirme conta, valor e data.',
    'Recorrência (aluguel, mensalidade): prefira create_payable_template a criar uma a uma.',
    'Aprovações de transações usam o fluxo V2 (cartão de aprovação + decisão no RPC) — nunca exponha nem chame tools V1 de pending operation.',
    'Ao listar, ordene por urgência: vencidas, vencendo esta semana, futuras.',
  ],
  pitfalls: [
    'Nunca dê baixa ou cancele sem confirmar qual conta e qual valor.',
    'Não confunda "criar conta a pagar" (compromisso futuro) com "lançar despesa" (dinheiro que já saiu).',
  ],
};
