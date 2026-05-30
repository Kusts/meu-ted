// ─────────────────────────────────────────────────────────────────────────────
// Household Entity
// ─────────────────────────────────────────────────────────────────────────────

export interface Household {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface HouseholdCreate {
  id: string;
  name: string;
  currency?: string;
  timezone?: string;
}

export interface HouseholdUpdate {
  name?: string;
  currency?: string;
  timezone?: string;
}

export const DEFAULT_CURRENCY = 'BRL';
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';