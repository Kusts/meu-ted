import type { ContextTokenReplayClaim, ContextTokenReplayGuard } from "./context-token-replay.js";

type ActiveClaim = Omit<ContextTokenReplayClaim, "expiresAt"> & { expiresAt: number };

export const createInMemoryContextTokenReplayGuard = (): ContextTokenReplayGuard => {
  const claimed = new Map<string, ActiveClaim>();
  return {
    async claim(input: ContextTokenReplayClaim): Promise<boolean> {
      const now = Date.now();
      for (const [jti, existing] of claimed) {
        if (existing.expiresAt <= now) claimed.delete(jti);
      }
      const expiresAt = input.expiresAt.getTime();
      if (expiresAt <= now) return false;
      const existing = claimed.get(input.jti);
      if (existing) {
        return existing.workspaceId === input.workspaceId
          && existing.requestId === input.requestId
          && existing.providerMessageId === input.providerMessageId;
      }
      claimed.set(input.jti, { ...input, expiresAt });
      return true;
    },
  };
};
