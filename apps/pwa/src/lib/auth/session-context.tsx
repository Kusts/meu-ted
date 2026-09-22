"use client";

import { createContext, useContext } from "react";
import { getSessionStatus, type SessionSnapshot } from "./session-authority";

export type { SessionSnapshot };

export interface SessionApi {
  /** Called by the data layer on a runtime 401: clears local session + snapshot, returns to device registration. */
  expireSession: (message?: string) => void;
  /**
   * Explicit session authority (V4.1 Closure AUTH-01): AuthGate mirrors the
   * probe result here — authenticated (non-secret identity), unauthenticated
   * (401/403: purge + login), unreachable (network: never logout), unknown
   * (pre-probe). Never derived from a storage bearer.
   */
  session: SessionSnapshot;
}

const SessionContext = createContext<SessionApi | null>(null);

export const SessionProvider = SessionContext.Provider;

/**
 * Defensive default: when rendered without AuthGate (e.g. unit tests),
 * expireSession is a no-op and the session falls back to the module-level
 * authority (unknown pre-probe, so legacy bearer fallbacks still apply).
 */
export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (ctx) return ctx;
  return { expireSession: () => {}, session: getSessionStatus() };
}
