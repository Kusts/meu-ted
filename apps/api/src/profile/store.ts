import type { Profile } from '../types/domain.js';

export type ProfileStore = {
  get(householdId: string): Promise<Profile | null>;
  upsert(householdId: string, input: {
    name?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    avatarColor?: string | undefined;
    greetingStyle?: Profile['greetingStyle'] | undefined;
  }): Promise<Profile>;
};
