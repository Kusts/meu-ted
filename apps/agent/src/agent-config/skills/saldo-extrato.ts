import type { Skill } from './types.js';

export const saldoExtratoSkill: Skill = {
  name: 'saldo-extrato',
  title: 'Saldo e extrato',
  when: 'saber quanto tem, ver saldo por conta ou puxar o extrato recente',
  keywords: [
    'saldo', 'quanto tenho', 'quanto tem', 'extrato', 'movimentação', 'movimentacao',
    'conta', 'mostrar', 'ver ', 'consultar', 'quanto sobrou', 'sobrou',
  ],
  tools: ['get_balance', 'list_accounts', 'list_recent_transactions', 'get_month_summary'],
  steps: [
    'Para "quanto tenho": chame get_balance e apresente o total mais o resumo por conta.',
    'Para extrato: use list_recent_transactions com limite sensato (padrão 10–20) e resuma por dia ou categoria.',
    'Se a pessoa citar uma conta pelo nome, resolva o id com list_accounts antes de filtrar.',
    'Dê o número exato retornado pela tool, em reais e com a data de referência.',
  ],
  pitfalls: [
    'Nunca estime saldo de cabeça: sempre chame get_balance primeiro.',
    'Não liste dezenas de lançamentos crus no chat — resuma e ofereça detalhar.',
  ],
};
