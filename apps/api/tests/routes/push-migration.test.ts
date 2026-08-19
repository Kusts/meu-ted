import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { expectedMigrationManifest } from "../../src/read-models/sql/migrate.js";

describe("Web Push migration", () => {
  it("includes V024 and V025 in canonical manifest", () => {
    expect(expectedMigrationManifest().map(({ version }) => version)).toContain(
      24,
    );
    expect(expectedMigrationManifest().map(({ version }) => version)).toContain(
      25,
    );
  });

  it("stores subscriptions with workspace and actor scope", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "src/read-models/sql/V024__push_subscriptions.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("workspace_id  UUID NOT NULL");
    expect(sql).toContain("user_id       TEXT NOT NULL");
    expect(sql).toContain("UNIQUE (workspace_id, user_id, endpoint)");
  });
  it("defines timezone and durable reminder dedupe state", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "src/read-models/sql/V025__push_reminder_scheduler.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS timezone");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS last_run_at");
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS push_reminder_deliveries",
    );
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS push_delivery_attempts");
    expect(sql).toContain("'deduplicated'");
    expect(sql).toContain("'quarantined'");
    expect(sql).toContain(
      "UNIQUE (household_id, notification_id, local_date, notification_type)",
    );
  });
});
