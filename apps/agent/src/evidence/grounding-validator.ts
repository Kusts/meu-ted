import type { EvidenceEnvelope } from './evidence-envelope.js';

type GroundingResult = Readonly<{ valid: boolean; unsupportedClaims: readonly string[] }>;

const fold = (value: string): string =>
  (value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const money = (text: string): number[] => [...text.matchAll(/R\$\s*([\d.]+),([\d]{2})/g)].map((match) => Number(`${match[1]!.replaceAll('.', '')}.${match[2]!}`) * 100);

const percentages = (text: string): number[] =>
  [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map((match) => Number(match[1]!.replace(',', '.')));

const MONTHS_PT = '(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)';
const MONTH_INDEX: Record<string, string> = {
  janeiro: '01', fevereiro: '02', marco: '03', 'março': '03', abril: '04', maio: '05', junho: '06',
  julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
};

const dates = (text: string): string[] => {
  const found: string[] = [];
  for (const match of text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) {
    const day = match[1]!.padStart(2, '0');
    const month = match[2]!.padStart(2, '0');
    found.push(match[3] ? `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${month}-${day}` : `--${month}-${day}`);
  }
  for (const match of text.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    found.push(`${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`);
  }
  for (const match of text.matchAll(new RegExp(`\\b(\\d{1,2})\\s+de\\s+${MONTHS_PT}\\b`, 'gi'))) {
    const month = MONTH_INDEX[fold(match[2]!)] ?? MONTH_INDEX[match[2]!.toLowerCase()] ?? '00';
    found.push(`--${month}-${match[1]!.padStart(2, '0')}`);
  }
  return [...new Set(found)];
};

const names = (text: string): string[] => {
  const found = new Set<string>();
  for (const match of text.matchAll(/"([^"]{2,60})"/g)) found.add(match[1]!.trim());
  for (const match of text.matchAll(/(?:conta|cart[aã]o|categoria)\s+([A-Za-zÁÀÃÂÉÊÍÓÔÕÚÇáàãâéêíóôõúç][\wÁÀÃÂÉÊÍÓÔÕÚÇáàãâéêíóôõúç]*(?:\s+[A-Za-zÁÀÃÂÉÊÍÓÔÕÚÇáàãâéêíóôõúç][\wÁÀÃÂÉÊÍÓÔÕÚÇáàãâéêíóôõúç]*){0,1})/gi)) {
    found.add(match[1]!.replace(/[.!?,]+$/, '').trim());
  }
  for (const match of text.matchAll(/(?:na|no|em|da|do|para|conta|cartao|cartão|categoria)\s+([A-ZÁÀÃÂÉÊÍÓÔÕÚÇ][\wÁÀÃÂÉÊÍÓÔÕÚÇ]*(?:\s+[\wÁÀÃÂÉÊÍÓÔÕÚÇ]*)*)/g)) {
    found.add(match[1]!.replace(/[.!?,]+$/, '').trim());
  }
  for (const match of text.matchAll(/\b([A-ZÁÀÃÂÉÊÍÓÔÕÚÇ][a-záàãâéêíóôõúç]+(?:\s+[A-ZÁÀÃÂÉÊÍÓÔÕÚÇ][a-záàãâéêíóôõúç]+)+)/g)) {
    found.add(match[1]!.trim());
  }
  return [...found].filter((name) => name.length >= 2);
};

const flatten = (value: unknown): unknown[] => Array.isArray(value) ? value.flatMap(flatten) : value && typeof value === 'object' ? Object.values(value).flatMap(flatten) : [value];

const moneyCentsIn = (value: unknown): number[] => {
  if (typeof value === 'number' && Number.isFinite(value)) return [Math.trunc(value)];
  if (typeof value === 'string') {
    const out: number[] = [];
    for (const match of value.matchAll(/R\$\s*([\d.]+),([\d]{2})/g)) {
      out.push(Number(`${match[1]!.replaceAll('.', '')}.${match[2]!}`) * 100);
    }
    return out;
  }
  return [];
};

export const validateGroundedClaims = (text: string, envelope: EvidenceEnvelope): GroundingResult => {
  const values = flatten(envelope.items.filter((item) => item.status === 'ok').map((item) => item.data));
  const supportedMoney = new Set(values.flatMap(moneyCentsIn));
  const supportedNumbers = new Set(
    values.filter((value): value is number => typeof value === 'number').map((n) => Math.round(n * 100) / 100),
  );
  const supportedStrings = values.filter((value): value is string => typeof value === 'string');
  const foldedStrings = supportedStrings.map(fold);
  const unsupportedClaims: string[] = [];
  for (const value of money(text)) {
    if (!supportedMoney.has(value) && !supportedNumbers.has(value)) unsupportedClaims.push(`R$ ${value}`);
  }
  for (const percent of percentages(text)) {
    if (!supportedNumbers.has(percent) && !supportedMoney.has(percent)) unsupportedClaims.push(`${percent}%`);
  }
  const envelopeText = fold(supportedStrings.join(' | '));
  for (const date of dates(text)) {
    const compact = date.replace(/-/g, '');
    const slashDayMonth = date.startsWith('--') ? date.slice(2).split('-').reverse().join('/') : null;
    const matched =
      envelopeText.includes(fold(date)) ||
      envelopeText.includes(compact) ||
      (date.startsWith('--') && envelopeText.includes(date.slice(2))) ||
      (slashDayMonth !== null && envelopeText.includes(slashDayMonth));
    if (!matched) unsupportedClaims.push(date);
  }
  for (const name of names(text)) {
    const folded = fold(name);
    if (foldedStrings.some((candidate) => candidate.includes(folded) || folded.includes(candidate))) continue;
    // Fallback for keyword-led captures with trailing context ("conta
    // principal está…"): the claim is supported when its leading nominal
    // token appears in evidence. Unknown proper names still fail.
    const tokens = folded.split(/[^a-z0-9]+/).filter((token) => token.length > 2);
    const head = tokens[0];
    if (head && tokens.length > 1 && envelopeText.includes(head)) continue;
    unsupportedClaims.push(name);
  }
  return { valid: unsupportedClaims.length === 0, unsupportedClaims };
};
