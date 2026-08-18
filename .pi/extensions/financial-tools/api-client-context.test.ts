import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { requestPiApiJson } from "./tools/api-client.js";
import { getPendingOperationTool } from "./generated/http-tools.js";

const originalFetch = globalThis.fetch;
const originalEnv = {
  PI_FINANCE_API_BASE_URL: process.env.PI_FINANCE_API_BASE_URL,
  PI_FINANCE_API_DEVICE_TOKEN: process.env.PI_FINANCE_API_DEVICE_TOKEN,
  PI_CONTEXT_TOKEN: process.env.PI_CONTEXT_TOKEN,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Pi API context transport", () => {
  it("sends context token only when present", async () => {
    process.env.PI_FINANCE_API_BASE_URL = "http://api.test";
    process.env.PI_FINANCE_API_DEVICE_TOKEN = "device-token";
    process.env.PI_CONTEXT_TOKEN = "context-token-a";
    let headers: Headers | undefined;
    globalThis.fetch = async (_input, init) => {
      headers = new Headers(init?.headers);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    await requestPiApiJson("GET", "/health");
    assert.equal(headers?.get("x-pi-context-token"), "context-token-a");
    assert.equal(headers?.get("x-device-token"), "device-token");

    delete process.env.PI_CONTEXT_TOKEN;
    await requestPiApiJson("GET", "/health");
    assert.equal(headers?.get("x-pi-context-token"), null);
  });
  it("uses the generated pending adapter without DATABASE_URL", async () => {
    process.env.PI_FINANCE_API_BASE_URL = "http://api.test";
    process.env.PI_FINANCE_API_DEVICE_TOKEN = "device-token";
    process.env.PI_CONTEXT_TOKEN = "context-token-pending";
    let url = "";
    globalThis.fetch = async (input, init) => {
      url = String(input);
      assert.equal(new Headers(init?.headers).get("x-pi-context-token"), "context-token-pending");
      return new Response(JSON.stringify({ operation: { id: "pending-1", chatId: "chat-1" } }), { status: 200 });
    };

    const result = await getPendingOperationTool.execute(
      "call-pending",
      { chatId: "chat-1" },
      new AbortController().signal,
      undefined,
    ) as { operation: { id: string } };

    assert.equal(result.operation.id, "pending-1");
    assert.equal(url, "http://api.test/pending-operations/details?chatId=chat-1");
  });
});
