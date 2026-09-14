export type ParsedMutation =
  | { kind: 'expense' | 'income'; amountCents: number; description: string; date: string; categoryQuery?: string }
  | { kind: 'none'; reason: 'negation' | 'missing_amount' | 'unsupported' };

const money = /(?:r\$\s*)?([0-9]{1,12}(?:[.,][0-9]{1,2})?)/i;
const negation = /\b(n[aã]o|nunca|jamais)\b/i;
const dateFor = (text: string, now = new Date(), timeZone = 'America/Sao_Paulo'): string => {
  const base = new Date(new Intl.DateTimeFormat('en-CA', { timeZone }).format(now) + 'T12:00:00Z');
  if (/anteontem/i.test(text)) base.setUTCDate(base.getUTCDate() - 2);
  else if (/ontem/i.test(text)) base.setUTCDate(base.getUTCDate() - 1);
  return base.toISOString().slice(0, 10);
};

const cents = (raw: string): number => {
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const [whole, fraction = ''] = normalized.split('.');
  if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(fraction)) throw new Error('invalid_amount');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
};

export const parseFinancialMutation = (text: string, options: { now?: Date; timeZone?: string } = {}): ParsedMutation => {
  if (negation.test(text)) return { kind: 'none', reason: 'negation' };
  const match = text.match(money);
  if (!match) return { kind: 'none', reason: 'missing_amount' };
  let amountCents: number;
  try { amountCents = cents(match[1]!); } catch { return { kind: 'none', reason: 'missing_amount' }; }
  const income = /\b(recebi|ganhei|entrou|renda|sal[aá]rio)\b/i.test(text);
  const remainder = text.slice((match.index ?? 0) + match[0].length)
    .replace(/^\s*(em|de|do|da|no|na|por)\s+/i, '').replace(/\s+(ontem|hoje|anteontem)$/i, '').trim();
  const description = remainder || (income ? 'receita' : 'despesa');
  return { kind: income ? 'income' : 'expense', amountCents, description, date: dateFor(text, options.now, options.timeZone), ...( /\b(categoria|categoria de)\s+([^,.;]+)/i.exec(text)?.[2] ? { categoryQuery: /\b(categoria|categoria de)\s+([^,.;]+)/i.exec(text)![2]!.trim() } : {}) };
};

export const parseMoneyToCents = (value: string): number => cents(value.replace(/^r\$\s*/i, '').trim());
export const parseMutationRequest = parseFinancialMutation;
