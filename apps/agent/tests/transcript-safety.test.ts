import { describe, expect, it } from "vitest";
import { backfillTranscript } from "../src/schema";
import { redactTranscript, redactTranscriptJson } from "../src/transcript-safety";

describe("transcript safety", () => {
  it("redacts complete Authorization bearer and basic values", () => {
    const result = redactTranscript("Authorization: Bearer abc123; Authorization: Basic dXNlcjpwYXNz");
    expect(result).not.toMatch(/abc123|dXNlcjpwYXNz/);
  });

  it("redacts PEM private keys and credential assignment variants in plain text", () => {
    const result = redactTranscript("private_key=-----BEGIN PRIVATE KEY-----\\nSECRET\\n-----END PRIVATE KEY----- credentials=LIVE-CREDENTIAL passphrase=phrase access_key_id=access-secret accessKeyId=camel-access secret_key=under-secret token_value=token-secret");
    expect(result).not.toMatch(/BEGIN PRIVATE KEY|SECRET|LIVE-CREDENTIAL|=phrase|access-secret|camel-access|under-secret|token-secret/);
  });

  it("redacts quoted credential keys and keeps JSON valid", () => {
    const payload = { output: "Authorization: Bearer abc123", password: "secret", access_token: "oauth-secret", refresh_token: "refresh-secret", private_key: "pem-secret", credentials: "cred-secret", passphrase: "phrase-secret", access_key_id: "access-secret", accessKeyId: "camel-access", secret_key: "under-secret", token_value: "token-secret" };
    const result = redactTranscriptJson(JSON.stringify(payload));
    expect(JSON.parse(result)).toEqual({ output: "Authorization: [REDACTED]", password: "[REDACTED]", access_token: "[REDACTED]", refresh_token: "[REDACTED]", private_key: "[REDACTED]", credentials: "[REDACTED]", passphrase: "[REDACTED]", access_key_id: "[REDACTED]", accessKeyId: "[REDACTED]", secret_key: "[REDACTED]", token_value: "[REDACTED]" });
    expect(redactTranscript(JSON.stringify(payload))).not.toMatch(/oauth-secret|refresh-secret|abc123|pem-secret|cred-secret|phrase-secret|access-secret|camel-access|under-secret|token-secret/);
  });

  it("backfills every durable transcript-bearing table once", () => {
    const updates: Array<{ query: string; bindings: unknown[] }> = [];
    const sql = {
      exec<T = unknown>(query: string, ...bindings: unknown[]): Iterable<T> {
        if (query.startsWith("SELECT id FROM transcript_redaction")) return [] as T[];
        if (query.startsWith("SELECT id, content_json FROM messages")) return [{ id: "m1", content_json: JSON.stringify("Authorization: Bearer old-message accessKeyId=old-access") }] as T[];
        if (query.startsWith("SELECT id, payload_json FROM agent_actions")) return [{ id: "a1", payload_json: JSON.stringify({ token: "old-action", secret_key: "old-secret" }) }] as T[];
        if (query.startsWith("SELECT id, input_json, output_json FROM turn_queue")) return [{ id: "t1", input_json: JSON.stringify({ content: "password=old-input" }), output_json: JSON.stringify({ output: "token_value=old-output" }) }] as T[];
        if (query.startsWith("SELECT turn_id, event_id, payload_json FROM turn_events")) return [{ turn_id: "t1", event_id: 1, payload_json: JSON.stringify({ output: "Bearer old-event" }) }] as T[];
        updates.push({ query, bindings });
        return [] as T[];
      },
    };

    backfillTranscript(sql);

    expect(updates).toHaveLength(5);
    expect(updates.every(({ bindings }) => !JSON.stringify(bindings).match(/old-(message|access|action|secret|input|output|event)/))).toBe(true);
  });
});
