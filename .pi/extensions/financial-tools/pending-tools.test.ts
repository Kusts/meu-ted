import test from "node:test";
import assert from "node:assert/strict";
import { getPendingOperationTool } from "./tools/get_pending_operation.js";
import { confirmPendingOperationTool } from "./tools/confirm_pending_operation.js";
import { cancelPendingOperationTool } from "./tools/cancel_pending_operation.js";

const pendingId = "11111111-1111-4111-8111-111111111111";

test("pending Pi tools use the API and never report capability-disabled", async () => {
  process.env.PI_FINANCE_API_BASE_URL = "https://finance.test";
  process.env.PI_FINANCE_API_DEVICE_TOKEN = "device-token";
  const calls: { method: string; url: string; headers: Headers }[] = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ method: init?.method ?? "GET", url: String(input), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify({ id: pendingId, status: "pending" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const read = await getPendingOperationTool.execute({ pendingOperationId: pendingId });
    const approved = await confirmPendingOperationTool.execute({ pendingOperationId: pendingId, idempotencyKey: "approve-1" });
    const rejected = await cancelPendingOperationTool.execute({ pendingOperationId: pendingId, idempotencyKey: "reject-1" });
    assert.equal(read.success, true);
    assert.equal(approved.success, true);
    assert.equal(rejected.success, true);
    assert.deepEqual(calls.map((call) => [call.method, new URL(call.url).pathname]), [
      ["GET", `/pending-operations/details`],
      ["POST", `/pending-operations/approve`],
      ["POST", `/pending-operations/reject`],
    ]);
    assert.equal(calls[1].headers.get("idempotency-key"), "approve-1");
    assert.equal(calls[2].headers.get("idempotency-key"), "reject-1");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
