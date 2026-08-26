import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { apiFetch } from "../../src/lib/api/client";
import { createServer } from "./server";
import { z } from "zod";

const BASE_URL_ENV = "NEXT_PUBLIC_PI_FINANCE_API_BASE_URL";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let server: http.Server;
let previousBaseUrl: string | undefined;

before(async () => {
  previousBaseUrl = process.env[BASE_URL_ENV];
  server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  process.env[BASE_URL_ENV] = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (previousBaseUrl === undefined) delete process.env[BASE_URL_ENV];
  else process.env[BASE_URL_ENV] = previousBaseUrl;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const idempotencyResponseSchema = z.object({ idempotencyKey: z.string() });

test("apiFetch sends generated idempotency key through the real HTTP boundary", async () => {
  const response = await apiFetch(
    "/__e2e/echo-idempotency",
    { method: "POST", responseSchema: idempotencyResponseSchema },
  );

  assert.match(response.idempotencyKey, UUID_V4);
});

test("repeated submission can reuse the same idempotency key", async () => {
  const key = "e2e-repeat-key";
  const first = await apiFetch("/__e2e/echo-idempotency", {
    method: "POST",
    idempotencyKey: key,
    responseSchema: idempotencyResponseSchema,
  });
  const second = await apiFetch("/__e2e/echo-idempotency", {
    method: "POST",
    idempotencyKey: key,
    responseSchema: idempotencyResponseSchema,
  });

  assert.equal(first.idempotencyKey, key);
  assert.equal(second.idempotencyKey, key);
});
