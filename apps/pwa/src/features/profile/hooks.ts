"use client";

import { useAppState } from "@/lib/state/app-state-context";
import type { Profile } from "@/lib/state/types";

/**
 * Resolved profile for the current session.
 *
 * If the backend returned a profile, use it as-is. Otherwise fall back to
 * a stable local default that PWA surfaces (Home greeting + avatar) can
 * render before the user completes onboarding.
 */
export function useEffectiveProfile(): Profile {
  const { profile } = useAppState();
  if (profile) return profile;
  return {
    householdId: "local",
    name: "Visitante",
    email: "",
    phone: "",
    avatarColor: "#0E8C5A",
    greetingStyle: "auto",
    updatedAt: new Date(0).toISOString(),
  };
}
