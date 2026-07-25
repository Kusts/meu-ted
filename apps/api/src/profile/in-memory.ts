import type { Profile } from '../types/domain.js';
import type { ProfileStore } from './store.js';

export const createInMemoryProfileStore = (): ProfileStore => {
  const profiles = new Map<string, Profile>();

  return {
    async get(householdId) {
      return profiles.get(householdId) ?? null;
    },
    async upsert(householdId, input) {
      const existing = profiles.get(householdId);
      const next: Profile = {
        householdId,
        name: input.name ?? existing?.name ?? 'Usuário',
        email: input.email ?? existing?.email ?? '',
        phone: input.phone ?? existing?.phone ?? '',
        avatarColor: input.avatarColor ?? existing?.avatarColor ?? '#0E8C5A',
        greetingStyle: (input.greetingStyle ?? existing?.greetingStyle ?? 'auto') as Profile['greetingStyle'],
        updatedAt: new Date().toISOString(),
      };
      profiles.set(householdId, next);
      return next;
    },
  };
};
