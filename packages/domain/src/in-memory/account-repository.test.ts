import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAccountRepository } from './account-repository.js';
import type { Account, AccountType, AccountScope } from '../core/entities/account.js';

// Factory helper
function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: crypto.randomUUID(),
    householdId: 'household-1',
    name: 'Conta Teste',
    type: 'checking' as AccountType,
    ownerUserId: null,
    scope: 'shared' as AccountScope,
    initialBalanceCents: 0,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('InMemoryAccountRepository', () => {
  let repo: InMemoryAccountRepository;

  beforeEach(() => {
    repo = new InMemoryAccountRepository();
  });

  describe('create', () => {
    it('should create account with all fields', async () => {
      const account = makeAccount({ name: 'Inter' });
      const created = await repo.create(account);

      expect(created.id).toBe(account.id);
      expect(created.name).toBe('Inter');
      expect(created.householdId).toBe('household-1');
      expect(created.initialBalanceCents).toBe(0);
    });

    it('should allow negative initial balance (REQ-010)', async () => {
      const account = makeAccount({ initialBalanceCents: -50000 });
      const created = await repo.create(account);

      expect(created.initialBalanceCents).toBe(-50000);
    });
  });

  describe('findById', () => {
    it('should find existing account', async () => {
      const account = makeAccount({ name: 'Nubank' });
      await repo.create(account);

      const found = await repo.findById(account.id);

      expect(found).not.toBeNull();
      expect(found!.name).toBe('Nubank');
    });

    it('should return null for non-existent id', async () => {
      const found = await repo.findById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findByHouseholdId', () => {
    it('should return all accounts for household', async () => {
      await repo.create(makeAccount({ name: 'Conta 1' }));
      await repo.create(makeAccount({ name: 'Conta 2' }));
      await repo.create(makeAccount({ householdId: 'other-household', name: 'Other' }));

      const accounts = await repo.findByHouseholdId('household-1');

      expect(accounts).toHaveLength(2);
      expect(accounts.map(a => a.name)).toContain('Conta 1');
      expect(accounts.map(a => a.name)).toContain('Conta 2');
    });

    it('should return empty array for household with no accounts', async () => {
      const accounts = await repo.findByHouseholdId('non-existent-household');
      expect(accounts).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should update existing account', async () => {
      const account = makeAccount({ name: 'Old Name' });
      await repo.create(account);

      const updated = await repo.update(account.id, { name: 'New Name' });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('New Name');
    });

    it('should return null for non-existent id', async () => {
      const updated = await repo.update('non-existent', { name: 'New Name' });
      expect(updated).toBeNull();
    });
  });

  describe('findActive', () => {
    it('should return only active accounts', async () => {
      const active = makeAccount({ name: 'Active', active: true });
      const inactive = makeAccount({ name: 'Inactive', active: false });
      await repo.create(active);
      await repo.create(inactive);

      const result = await repo.findActive('household-1');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Active');
    });
  });
});