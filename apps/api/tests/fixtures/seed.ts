/**
 * Test fixtures: minimal seed with two households so we can prove
 * household scoping in tests.
 */

import type { Account, Category, Transaction } from '../../src/types/domain.js';

export const HOUSEHOLD_A = '00000000-0000-4000-8000-00000000000a';
export const HOUSEHOLD_B = '00000000-0000-4000-8000-00000000000b';

export const ACCOUNT_A1: Account = {
  id: '11111111-1111-4111-8111-111111111111',
  householdId: HOUSEHOLD_A,
  name: 'Itaú',
  kind: 'bank',
  balanceCents: 1_000_00,
  status: 'active',
};

export const ACCOUNT_A2: Account = {
  id: '11111111-1111-4111-8111-111111111112',
  householdId: HOUSEHOLD_A,
  name: 'Nubank',
  kind: 'bank',
  balanceCents: 500_00,
  status: 'active',
};

export const ACCOUNT_B1: Account = {
  id: '11111111-1111-4111-8111-111111111113',
  householdId: HOUSEHOLD_B,
  name: 'Bradesco',
  kind: 'bank',
  balanceCents: 999_99,
  status: 'active',
};

export const CATEGORY_FOOD_A: Category = {
  id: '22222222-2222-4222-8222-222222222221',
  householdId: HOUSEHOLD_A,
  name: 'Mercado',
  kind: 'expense',
  status: 'active',
};

export const CATEGORY_RENT_A: Category = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: HOUSEHOLD_A,
  name: 'Aluguel',
  kind: 'expense',
  status: 'active',
};

export const CATEGORY_SALARY_A: Category = {
  id: '22222222-2222-4222-8222-222222222223',
  householdId: HOUSEHOLD_A,
  name: 'Salário',
  kind: 'income',
  status: 'active',
};

export const CATEGORY_FOOD_B: Category = {
  id: '22222222-2222-4222-8222-222222222224',
  householdId: HOUSEHOLD_B,
  name: 'Mercado',
  kind: 'expense',
  status: 'active',
};

export const TRANSACTIONS: Transaction[] = [
  {
    id: '33333333-3333-4333-8333-333333333301',
    householdId: HOUSEHOLD_A,
    kind: 'expense',
    description: 'Mercado da semana',
    amountCents: 480_50,
    date: '2026-06-10',
    accountId: ACCOUNT_A1.id,
    categoryId: CATEGORY_FOOD_A.id,
  },
  {
    id: '33333333-3333-4333-8333-333333333302',
    householdId: HOUSEHOLD_A,
    kind: 'expense',
    description: 'Aluguel',
    amountCents: 2_400_00,
    date: '2026-06-05',
    accountId: ACCOUNT_A1.id,
    categoryId: CATEGORY_RENT_A.id,
  },
  {
    id: '33333333-3333-4333-8333-333333333303',
    householdId: HOUSEHOLD_A,
    kind: 'income',
    description: 'Salário',
    amountCents: 12_000_00,
    date: '2026-06-01',
    accountId: ACCOUNT_A1.id,
    categoryId: CATEGORY_SALARY_A.id,
  },
  {
    id: '33333333-3333-4333-8333-333333333304',
    householdId: HOUSEHOLD_A,
    kind: 'transfer',
    description: 'Itaú → Nubank',
    amountCents: 500_00,
    date: '2026-06-08',
    accountId: ACCOUNT_A1.id,
    transferToAccountId: ACCOUNT_A2.id,
  },
  {
    id: '33333333-3333-4333-8333-333333333305',
    householdId: HOUSEHOLD_B,
    kind: 'expense',
    description: 'Mercado',
    amountCents: 200_00,
    date: '2026-06-09',
    accountId: ACCOUNT_B1.id,
    categoryId: CATEGORY_FOOD_B.id,
  },
];
