import { describe, it, expect } from "vitest";
import { buildTestApp, TOKEN_A } from "../test-app.js";

describe("POST /transactions/detect-duplicate", () => {
  it("requires authentication", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: "POST", url: "/transactions/detect-duplicate", payload: { kind: "expense", description: "teste", amountCents: 1000, date: "2026-08-26" } });
    expect(res.statusCode).toBe(401);
  });

  it("returns duplicate_detected false when no match", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/transactions/detect-duplicate",
      headers: { "x-device-token": TOKEN_A },
      payload: { kind: "expense", description: "compra unica xyz 999", amountCents: 9999, date: "2026-08-26" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ duplicate_detected: false });
  });

  it("validates payload", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/transactions/detect-duplicate",
      headers: { "x-device-token": TOKEN_A },
      payload: { kind: "invalid", description: "" },
    });
    expect(res.statusCode).toBe(400);
  });
});
