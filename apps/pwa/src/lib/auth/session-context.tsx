"use client";

import { createContext, useContext } from "react";

export interface SessionApi {
  /** Called by the data layer on a runtime 401: clears local session + snapshot, returns to device registration. */
  expireSession: (message?: string) => void;
}

const SessionContext = createContext<SessionApi | null>(null);

export const SessionProvider = SessionContext.Provider;

/** Defensive default: when rendered without AuthGate (e.g. unit tests), expireSession is a no-op. */
export function useSession(): SessionApi {
  return useContext(SessionContext) ?? { expireSession: () => {} };
}
