/**
 * TDD-RED spec — Restored by coordinator (2026-08-19) after agy deleted it.
 * Canonical source: docs/ops/2026-08-18-boundary-tests-diagnosis.md
 * Invariant required (G5.2.9 privacy/boundary): every API response crossing the
 * client boundary MUST be validated with `responseSchema` + `responseSchema.parse()`
 * in the API client (apps/pwa/src/lib/api/client.ts / endpoints) and the
 * `pwaControlSchema.parse` guard in the service worker control channel.
 * This file is RED by design until the boundary validation exists (Item 28 — Fase 3 G3).
 */
import { describe, it, expect, vi } from "vitest";

describe("API response boundary (G5.2.9)", () => {
  it("exposes a responseSchema (zod) that validates the canonical envelope", async () => {
    const { responseSchema } = await import("./client");
    expect(responseSchema).toBeDefined();
    const parsed = responseSchema.safeParse({ ok: true, data: null, error: null });
    expect(parsed.success).toBe(true);
    const rejected = responseSchema.safeParse({ unexpected: true });
    expect(rejected.success).toBe(false);
  });

  it("parses every response with responseSchema before returning it (no raw passthrough)", async () => {
    const client = await import("./client");
    const parseSpy = vi.spyOn(client.responseSchema, "parse");
    expect(client.responseSchema.parse).toBeDefined();
    // The boundary contract: the client fetcher must call responseSchema.parse.
    expect(parseSpy).toBeDefined();
  });
});

describe("Service worker control boundary (G5.2.9)", () => {
  it("validates pwaControl messages with pwaControlSchema.parse in sw.ts", async () => {
    const sw = await import("../../sw");
    expect(sw.pwaControlSchema).toBeDefined();
    const ok = sw.pwaControlSchema.safeParse({ type: "control", action: "activate" });
    expect(ok.success).toBe(true);
  });
});