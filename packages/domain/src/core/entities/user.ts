// ─────────────────────────────────────────────────────────────────────────────
// User Entity
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole = 'owner' | 'member' | 'viewer';

export interface User {
  id: string;
  householdId: string;
  name: string;
  phone: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserCreate {
  id: string;
  householdId: string;
  name: string;
  phone: string;
  role: UserRole;
}

export interface UserUpdate {
  name?: string;
  phone?: string;
  role?: UserRole;
  active?: boolean;
}