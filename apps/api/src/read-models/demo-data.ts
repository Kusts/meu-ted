/**
 * Demo seed for the V1 read models.
 * Single household, mixed bank + cash accounts, no credit cards (per V1 spec:
 * "V1 Carteira shows bank/cash accounts only; credit-card accounts appear
 * after module 2").
 */

import type { Account, Category, Transaction } from '../types/domain.js';

export const DEMO_HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111';

export const DEMO_ACCOUNTS: Account[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    householdId: DEMO_HOUSEHOLD_ID,
    name: 'Itaú',
    kind: 'bank',
    balanceCents: 4_250_00,
    status: 'active',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    householdId: DEMO_HOUSEHOLD_ID,
    name: 'Nubank',
    kind: 'bank',
    balanceCents: 1_890_50,
    status: 'active',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    householdId: DEMO_HOUSEHOLD_ID,
    name: 'Carteira',
    kind: 'cash',
    balanceCents: 120_00,
    status: 'active',
  },
];

export const DEMO_CATEGORIES: Category[] = [
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', householdId: DEMO_HOUSEHOLD_ID, name: 'Mercado', kind: 'expense', status: 'active' },
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccc02', householdId: DEMO_HOUSEHOLD_ID, name: 'Aluguel', kind: 'expense', status: 'active' },
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccc03', householdId: DEMO_HOUSEHOLD_ID, name: 'Luz', kind: 'expense', status: 'active' },
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccc04', householdId: DEMO_HOUSEHOLD_ID, name: 'Internet', kind: 'expense', status: 'active' },
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccc05', householdId: DEMO_HOUSEHOLD_ID, name: 'Combustível', kind: 'expense', status: 'active' },
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccc06', householdId: DEMO_HOUSEHOLD_ID, name: 'Salário', kind: 'income', status: 'active' },
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccc07', householdId: DEMO_HOUSEHOLD_ID, name: 'Freela', kind: 'income', status: 'active' },
];

const today = new Date();
const isoDaysAgo = (days: number): string => {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

const monthStart = (): string => {
  const d = new Date(today);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

/**
 * Transactions span last 60 days so filters / cash flow 30d / month-to-date
 * all have non-trivial inputs.
 */
export const DEMO_TRANSACTIONS: Transaction[] = [
  {
    id: 'tttttttt-tttt-4ttt-8ttt-tttttttt0001',
    householdId: DEMO_HOUSEHOLD_ID,
    kind: 'income',
    description: 'Salário mensal',
    amountCents: 12_000_00,
    date: monthStart(),
    accountId: DEMO_ACCOUNTS[0]!.id,
    categoryId: DEMO_CATEGORIES[5]!.id,
  },
  {
    id: 'tttttttt-tttt-4ttt-8ttt-tttttttt0002',
    householdId: DEMO_HOUSEHOLD_ID,
    kind: 'expense',
    description: 'Aluguel apartamento',
    amountCents: 2_400_00,
    date: isoDaysAgo(2),
    accountId: DEMO_ACCOUNTS[0]!.id,
    categoryId: DEMO_CATEGORIES[1]!.id,
  },
  {
    id: 'tttttttt-tttt-4ttt-8ttt-tttttttt0003',
    householdId: DEMO_HOUSEHOLD_ID,
    kind: 'expense',
    description: 'Supermercado',
    amountCents: 480_50,
    date: isoDaysAgo(3),
    accountId: DEMO_ACCOUNTS[1]!.id,
    categoryId: DEMO_CATEGORIES[0]!.id,
  },
  {
    id: 'tttttttt-tttt-4ttt-8ttt-tttttttt0004',
    householdId: DEMO_HOUSEHOLD_ID,
    kind: 'expense',
    description: 'Conta de luz',
    amountCents: 215_30,
    date: isoDaysAgo(5),
    accountId: DEMO_ACCOUNTS[0]!.id,
    categoryId: DEMO_CATEGORIES[2]!.id,
  },
  {
    id: 'tttttttt-tttt-4ttt-8ttt-tttttttt0005',
    householdId: DEMO_HOUSEHOLD_ID,
    kind: 'expense',
    description: 'Internet fibra',
    amountCents: 129_90,
    date: isoDaysAgo(7),
    accountId: DEMO_ACCOUNTS[0]!.id,
    categoryId: DEMO_CATEGORIES[3]!.id,
  },
  {
    id: 'tttttttt-tttt-4ttt-8ttt-tttttttt0006',
    householdId: DEMO_HOUSEHOLD_ID,
    kind: 'expense',
    description: 'Combustível',
    amountCents: 320_00,
    date: isoDaysAgo(10),
    accountId: DEMO_ACCOUNTS[1]!.id,
    categoryId: DEMO_CATEGORIES[4]!.id,
  },
  {
    id: 'tttttttt-tttt-4ttt-8ttt-tttttttt0007',
    householdId: DEMO_HOUSEHOLD_ID,
    kind: 'expense',
    description: 'Mercado da semana',
    amountCents: 612_40,
    date: isoDaysAgo(15),
    accountId: DEMO_ACCOUNTS[1]!.id,
    categoryId: DEMO_CATEGORIES[0]!.id,
  },
  {
    id: 'tttttttt-tttt-4ttt-8ttt-tttttttt0008',
    householdId: DEMO_HOUSEHOLD_ID,
    kind: 'income',
    description: 'Pagamento freela',
    amountCents: 3_500_00,
    date: isoDaysAgo(18),
    accountId: DEMO_ACCOUNTS[0]!.id,
    categoryId: DEMO_CATEGORIES[6]!.id,
  },
  {
    id: 'tttttttt-tttt-4ttt-8ttt-tttttttt0009',
    householdId: DEMO_HOUSEHOLD_ID,
    kind: 'transfer',
    description: 'Itaú → Nubank',
    amountCents: 500_00,
    date: isoDaysAgo(20),
    accountId: DEMO_ACCOUNTS[0]!.id,
    transferToAccountId: DEMO_ACCOUNTS[1]!.id,
  },
  {
    id: 'tttttttt-tttt-4ttt-8ttt-tttttttt0010',
    householdId: DEMO_HOUSEHOLD_ID,
    kind: 'expense',
    description: 'Mercado mensal grande',
    amountCents: 980_00,
    date: isoDaysAgo(40),
    accountId: DEMO_ACCOUNTS[1]!.id,
    categoryId: DEMO_CATEGORIES[0]!.id,
  },
];
