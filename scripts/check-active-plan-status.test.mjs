import { test } from "node:test";
import assert from "node:assert/strict";
import { checkActivePlans } from "./check-active-plan-status.mjs";

test("active plans checker", async (t) => {
  await t.test("verifies active plans directory contains valid plans with goals", () => {
    const result = checkActivePlans();
    assert.equal(result.valid, true);
    assert.ok(result.total >= 6);
  });
});
