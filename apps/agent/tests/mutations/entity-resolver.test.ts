import { describe, expect, it } from 'vitest';
import {
  resolveMutationEntities,
  type EntityReader,
  type ResolvableMutation,
} from '../../src/mutations/entity-resolver.js';

const ACCOUNT_NUBANK = { id: '00000000-0000-4000-8000-000000000001', name: 'Nubank' };
const ACCOUNT_ITAU = { id: '00000000-0000-4000-8000-000000000002', name: 'Itaú' };
const CATEGORY_MERCADO = { id: '00000000-0000-4000-8000-000000000011', name: 'Mercado' };
const CATEGORY_ALIMENTACAO = { id: '00000000-0000-4000-8000-000000000012', name: 'Alimentação' };

const reader = (
  accounts: { id: string; name: string }[] = [],
  categories: { id: string; name: string }[] = [],
): EntityReader => ({
  listAccounts: async () => accounts,
  listCategories: async () => categories,
});

const parsed = (overrides: Partial<ResolvableMutation> = {}): ResolvableMutation => ({
  kind: 'expense',
  amountCents: 5000,
  description: 'mercado',
  date: '2026-09-14',
  ...overrides,
});

describe('entity-resolver (SPEC §7.2/§7.3/§7.6, H-01)', () => {
  it('RED: multiple accounts without a hint stay unresolved with real missingFields', async () => {
    const result = await resolveMutationEntities(
      parsed(),
      'Gastei R$ 50 no mercado',
      reader([ACCOUNT_NUBANK, ACCOUNT_ITAU], [CATEGORY_MERCADO]),
    );
    expect(result.complete).toBe(false);
    if (!result.complete) {
      expect(result.missingFields).toContain('accountId');
      expect(result.clarification).toMatch(/qual conta/i);
      expect(result.clarification).toMatch(/Nubank/);
      expect(result.clarification).toMatch(/Itaú/);
    }
  });

  it('RED: exactly one valid account auto-resolves its authoritative id', async () => {
    const result = await resolveMutationEntities(
      parsed(),
      'Gastei R$ 50 no mercado',
      reader([ACCOUNT_NUBANK], [CATEGORY_MERCADO]),
    );
    expect(result.complete).toBe(true);
    if (result.complete) expect(result.accountId).toBe(ACCOUNT_NUBANK.id);
  });

  it('RED: an explicit unambiguous account indication resolves without guessing', async () => {
    const result = await resolveMutationEntities(
      parsed(),
      'Gastei R$ 50 no mercado no Itaú',
      reader([ACCOUNT_NUBANK, ACCOUNT_ITAU], [CATEGORY_MERCADO]),
    );
    expect(result.complete).toBe(true);
    if (result.complete) expect(result.accountId).toBe(ACCOUNT_ITAU.id);
  });

  it('RED: a categoryQuery with exactly one authoritative match resolves to its real UUID', async () => {
    const result = await resolveMutationEntities(
      parsed({ categoryQuery: 'mercado' }),
      'Gastei R$ 50 no mercado categoria mercado',
      reader([ACCOUNT_NUBANK], [CATEGORY_MERCADO, CATEGORY_ALIMENTACAO]),
    );
    expect(result.complete).toBe(true);
    if (result.complete) expect(result.categoryId).toBe(CATEGORY_MERCADO.id);
  });

  it('RED: a categoryQuery with no match asks for clarification instead of proposing', async () => {
    const result = await resolveMutationEntities(
      parsed({ categoryQuery: 'nave espacial' }),
      'Gastei R$ 50 categoria nave espacial',
      reader([ACCOUNT_NUBANK], [CATEGORY_MERCADO]),
    );
    expect(result.complete).toBe(false);
    if (!result.complete) {
      expect(result.missingFields).toContain('categoryId');
      expect(result.missingFields).not.toContain('accountId');
      expect(result.clarification).toMatch(/categoria/i);
    }
  });

  it('RED: an ambiguous categoryQuery never picks silently', async () => {
    const result = await resolveMutationEntities(
      parsed({ categoryQuery: 'aliment' }),
      'Gastei R$ 50 categoria aliment',
      reader(
        [ACCOUNT_NUBANK],
        [CATEGORY_ALIMENTACAO, { id: '00000000-0000-4000-8000-000000000013', name: 'Alimentação fora' }],
      ),
    );
    expect(result.complete).toBe(false);
    if (!result.complete) expect(result.missingFields).toContain('categoryId');
  });
});
