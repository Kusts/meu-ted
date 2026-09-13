import type { EvidenceEnvelope } from './evidence-envelope.js';

type GroundingResult = Readonly<{ valid: boolean; unsupportedClaims: readonly string[] }>;

const money = (text: string): number[] => [...text.matchAll(/R\$\s*([\d.]+),([\d]{2})/g)].map((match) => Number(`${match[1]!.replaceAll('.', '')}.${match[2]!}`) * 100);
const flatten = (value: unknown): unknown[] => Array.isArray(value) ? value.flatMap(flatten) : value && typeof value === 'object' ? Object.values(value).flatMap(flatten) : [value];

export const validateGroundedClaims = (text: string, envelope: EvidenceEnvelope): GroundingResult => {
  const values = flatten(envelope.items.filter((item) => item.status === 'ok').map((item) => item.data));
  const supportedMoney = new Set(values.filter((value): value is number => typeof value === 'number'));
  const unsupportedClaims = money(text).filter((value) => !supportedMoney.has(value)).map((value) => `R$ ${value}`);
  const names = [...text.matchAll(/(?:na|no|em)\s+([A-ZÁÀÃÂÉÊÍÓÔÕÚÇ][\wÁÀÃÂÉÊÍÓÔÕÚÇ]*(?:\s+[\wÁÀÃÂÉÊÍÓÔÕÚÇ]*)*)/g)].map((match) => match[1]!.replace(/[.!?,]+$/, ''));
  for (const name of names) if (!values.includes(name)) unsupportedClaims.push(name);
  return { valid: unsupportedClaims.length === 0, unsupportedClaims };
};
