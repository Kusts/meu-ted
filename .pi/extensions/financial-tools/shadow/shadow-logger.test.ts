import { strict as assert } from "node:assert";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createShadowLogger } from "./shadow-logger.js";

describe("shadow logger", () => {
  it("deduplicates repeated divergence events", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-shadow-"));
    const path = join(directory, "events.jsonl");
    const log = createShadowLogger({ PI_SHADOW_LOG_PATH: path });
    const event = { kind: "divergence" as const, capability: "get_balance", requestHash: "a".repeat(64), apiHash: "b".repeat(64), legacyHash: "c".repeat(64) };

    log(event);
    log(event);

    assert.equal((await readFile(path, "utf8")).trim().split("\n").length, 1);
  });

  it("writes one structured event without raw request data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-shadow-"));
    const path = join(directory, "events.jsonl");
    const log = createShadowLogger({ PI_SHADOW_LOG_PATH: path });

    log({
      kind: "divergence",
      capability: "get_balance",
      requestHash: "a".repeat(64),
      apiHash: "b".repeat(64),
      legacyHash: "c".repeat(64),
    });

    const lines = (await readFile(path, "utf8")).trim().split("\n");
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]!).capability, "get_balance");
    assert.equal(lines[0]!.includes("household-a"), false);
  });
});
