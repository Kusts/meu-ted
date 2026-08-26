import type { Pool } from "pg";
import type { ContextTokenReplayClaim, ContextTokenReplayGuard } from "./context-token-replay.js";

export const purgeExpiredContextTokenReplays = async (pool: Pool): Promise<number> => {
  const result = await pool.query(
    "DELETE FROM context_token_replays WHERE expires_at <= NOW()",
  );
  return result.rowCount ?? 0;
};

export const createPostgresContextTokenReplayGuard = (
  pool: Pool,
): ContextTokenReplayGuard & { purgeExpired(): Promise<number> } => ({
  async purgeExpired() {
    return purgeExpiredContextTokenReplays(pool);
  },
  async claim(input: ContextTokenReplayClaim): Promise<boolean> {
    const result = await pool.query(
      `INSERT INTO context_token_replays
        (jti, workspace_id, request_id, provider_message_id, expires_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::timestamptz)
       ON CONFLICT (jti) DO UPDATE
       SET claimed_at = NOW()
       WHERE context_token_replays.expires_at <= NOW()
          OR (context_token_replays.workspace_id = EXCLUDED.workspace_id
              AND context_token_replays.request_id = EXCLUDED.request_id
              AND context_token_replays.provider_message_id = EXCLUDED.provider_message_id
              AND context_token_replays.expires_at > NOW())
       RETURNING jti`,
      [input.jti, input.workspaceId, input.requestId, input.providerMessageId, input.expiresAt],
    );
    return result.rowCount === 1;
  },
});
