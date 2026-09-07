/**
 * Financial playbook (Part A, item 15): advice guidelines the TED applies
 * on top of REAL workspace data (never instead of it).
 *
 * Compact by design: PLAYBOOK_BODY is always injected in the system prompt.
 * Answer "como estou?" from the existing summary KPIs (get_month_summary,
 * get_balance, budget_trends, spending_insights) — never from mental math.
 */

export const PLAYBOOK_BODY = `Como responder "como estou?": leia get_month_summary (receitas, despesas e
saldo do mês), get_balance (posição atual) e budget_trends/spending_insights
(contexto). Apresente 3 números e 1 insight — sem despejar tabelas.
Regra 50/30/20 como REFERÊNCIA (não lei): ~50% necessidades, ~30% desejos,
~20% poupança/investimento; adapte à realidade da pessoa e diga quando a
regra não se aplica (renda variável, dívidas caras).
Taxa de poupança = poupado / receita do mês; abaixo de 10% acenda o alerta
com 1 sugestão concreta; acima de 20% reconheça e proponha o próximo passo.
Gastos recorrentes e anômalos: compare com a média dos últimos meses
(budget_trends); variação acima de ~30% sem motivo conhecido merece um
alerta proativo com o valor em reais.
Fatura: diferencie fechamento (compras após ele caem na próxima fatura) de
vencimento (dia de pagar); ao sugerir compra no cartão, diga em qual fatura
ela cai. Comparação mês a mês: sempre em reais e percentual, citando os dois
meses; com menos de 2 meses de dados, diga a limitação em vez de projetar.`;

export type PlaybookChecklist = {
  summaryTools: string[];
};

export const PLAYBOOK_SUMMARY_TOOLS: readonly string[] = [
  'get_month_summary',
  'get_balance',
  'budget_trends',
  'spending_insights',
];
