import { test } from "node:test";
import assert from "node:assert/strict";
import { parse48hGateDoc, evaluate48hGate, create48hGateDocument } from "./g6-soak-status.mjs";

test("48-hour independence gate monitor", async (t) => {
  await t.test("parses markdown gate document", () => {
    const doc = create48hGateDocument("2026-08-18T00:00:00.000Z");
    const parsed = parse48hGateDoc(doc);
    assert.equal(parsed.startedAt, "2026-08-18T00:00:00.000Z");
    assert.equal(parsed.criticalAlerts, 0);
  });

  await t.test("evaluates window in progress when elapsed time < 48 hours", () => {
    const startMs = Date.parse("2026-08-18T00:00:00.000Z");
    const currentMs = startMs + 24 * 60 * 60 * 1000; // 24 hours later
    const evalResult = evaluate48hGate({ startedAt: "2026-08-18T00:00:00.000Z", criticalAlerts: 0 }, currentMs);

    assert.equal(evalResult.status, "IN_PROGRESS");
    assert.equal(evalResult.canClose, false);
    assert.ok(evalResult.elapsedHours >= 23.9 && evalResult.elapsedHours <= 24.1);
  });

  await t.test("permits closure when 48+ hours elapsed with 0 critical alerts", () => {
    const startMs = Date.parse("2026-08-18T00:00:00.000Z");
    const currentMs = startMs + 49 * 60 * 60 * 1000; // 49 hours later
    const evalResult = evaluate48hGate({ startedAt: "2026-08-18T00:00:00.000Z", criticalAlerts: 0 }, currentMs);

    assert.equal(evalResult.status, "COMPLETED");
    assert.equal(evalResult.canClose, true);
  });

  await t.test("blocks closure if critical alerts occurred during the window", () => {
    const startMs = Date.parse("2026-08-18T00:00:00.000Z");
    const currentMs = startMs + 50 * 60 * 60 * 1000;
    const evalResult = evaluate48hGate({ startedAt: "2026-08-18T00:00:00.000Z", criticalAlerts: 1 }, currentMs);

    assert.equal(evalResult.canClose, false);
    assert.ok(evalResult.reasons.some((r) => r.includes("critical alert")));
  });
});
