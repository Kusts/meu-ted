import type { Pool } from 'pg';
import { createHash } from 'node:crypto';
import type { AgentReplayStore, ConsumeTokenInput } from './agent-connection-token-replay.js';

export const hashJti = (jti: string): string => createHash('sha256').update(jti).digest('hex');

export const createPostgresAgentReplayStore = (pool: Pool): AgentReplayStore => ({
  async consume(input: ConsumeTokenInput): Promise<boolean> {
    try {
      await pool.query(
        `INSERT INTO agent_connection_token_replay (jti_hash, workspace_id, actor_id, connection_id, intention_id, expires_at, consumed_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          input.jtiHash,
          input.workspaceId,
          input.actorId,
          input.connectionId ?? null,
          input.intentionId ?? null,
          input.expiresAt.toISOString(),
        ],
      );
      return true;
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === '23505') {
        return false;
      }
      throw e;
    }
  },
});
