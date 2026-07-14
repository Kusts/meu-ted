// Profile adapter — extracted profile save/refresh/hydrate/persist logic.
// Handles both API mode (endpoints.patchProfile/fetchProfile) and local
// fallback mode (localStorage). The AppState provider injects this adapter
// to keep the write/read seam clean and testable.

import type { Profile } from "./types";
import * as endpoints from "@/lib/api/endpoints";

const PROFILE_KEY = "pi-finance:profile";
const LOCAL_HOUSEHOLD_ID = "local-household";

export interface ProfileAdapter {
  /** Save profile via API (if apiUsable) or locally. Returns the projected/API result. */
  save(input: ProfileInput, current: Profile | null): Promise<Profile>;
  /** Fetch profile from API when online; returns null when offline. */
  refresh(): Promise<Profile | null>;
  /** Read local profile from localStorage (mock/offline mode only). */
  hydrate(): Profile | null;
  /** Persist profile to localStorage (mock/offline mode only). */
  persist(profile: Profile): void;
}

export interface ProfileInput {
  name?: string;
  email?: string;
  phone?: string;
  avatarColor?: string;
  greetingStyle?: "auto" | "minimal" | "verbose";
}

export interface ProfileAdapterOptions {
  apiUsable: boolean;
}

export function createProfileAdapter(options: ProfileAdapterOptions): ProfileAdapter {
  const { apiUsable } = options;

  async function save(input: ProfileInput, current: Profile | null): Promise<Profile> {
    if (apiUsable) {
      // API mode: delegate to the backend, return the server's projected result.
      const updated = await endpoints.patchProfile(input);
      return updated;
    }

    // Local fallback: merge input with current profile, apply defaults.
    const householdId = current?.householdId ?? LOCAL_HOUSEHOLD_ID;
    return {
      householdId,
      name: input.name ?? current?.name ?? "Usuário",
      email: input.email ?? current?.email ?? "",
      phone: input.phone ?? current?.phone ?? "",
      avatarColor: input.avatarColor ?? current?.avatarColor ?? "#0E8C5A",
      greetingStyle: input.greetingStyle ?? current?.greetingStyle ?? "auto",
      updatedAt: new Date().toISOString(),
    };
  }

  async function refresh(): Promise<Profile | null> {
    if (!apiUsable) return null;
    return endpoints.fetchProfile();
  }

  function hydrate(): Profile | null {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as Profile;
    } catch {
      return null;
    }
  }

  function persist(profile: Profile): void {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {
      // localStorage may be unavailable (private mode) — silently noop
    }
  }

  return { save, refresh, hydrate, persist };
}
