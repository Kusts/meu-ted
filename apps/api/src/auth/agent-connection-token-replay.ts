export type ConsumeTokenInput = {
  jtiHash: string;
  workspaceId: string;
  actorId: string;
  connectionId?: string | null | undefined;
  intentionId?: string | null | undefined;
  expiresAt: Date;
};

export type AgentReplayStore = {
  consume(input: ConsumeTokenInput): Promise<boolean>;
};

export const createInMemoryAgentReplayStore = (): AgentReplayStore & { clear(): void; size(): number } => {
  const seen = new Map<string, { expiresAt: number; workspaceId: string; actorId: string }>();

  return {
    async consume(input: ConsumeTokenInput): Promise<boolean> {
      const now = Date.now();
      for (const [k, v] of seen) {
        if (v.expiresAt < now) {
          seen.delete(k);
        }
      }

      if (seen.has(input.jtiHash)) {
        return false;
      }

      seen.set(input.jtiHash, {
        expiresAt: input.expiresAt.getTime(),
        workspaceId: input.workspaceId,
        actorId: input.actorId,
      });
      return true;
    },
    clear() {
      seen.clear();
    },
    size() {
      return seen.size;
    },
  };
};
