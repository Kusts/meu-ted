import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  noteLegacyAuthUsage,
  getLegacyAuthUsage,
  clearLegacyAuthUsage,
} from "./legacy-usage";

/**
 * T2.2 B2 — telemetria LOCAL de uso do fallback legado: apenas contadores
 * (canal session|device), nunca valores de credencial.
 */
describe("legacy auth usage telemetry (V4 T2.2)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("starts zeroed", () => {
    expect(getLegacyAuthUsage()).toEqual({ session: 0, device: 0 });
  });

  it("counts session and device fallback attachments independently", () => {
    noteLegacyAuthUsage("session");
    noteLegacyAuthUsage("session");
    noteLegacyAuthUsage("device");
    expect(getLegacyAuthUsage()).toEqual({ session: 2, device: 1 });
  });

  it("persists across reads (durable local store)", () => {
    noteLegacyAuthUsage("device");
    expect(JSON.parse(localStorage.getItem("pi-finance:legacy-usage") ?? "{}")).toEqual({
      session: 0,
      device: 1,
    });
    expect(getLegacyAuthUsage()).toEqual({ session: 0, device: 1 });
  });

  it("never stores credential values", () => {
    noteLegacyAuthUsage("session");
    const raw = localStorage.getItem("pi-finance:legacy-usage") ?? "";
    expect(raw).not.toContain("Bearer");
    expect(raw).not.toContain("token");
    expect(getLegacyAuthUsage()).toEqual({ session: 1, device: 0 });
  });

  it("clears on demand", () => {
    noteLegacyAuthUsage("session");
    clearLegacyAuthUsage();
    expect(getLegacyAuthUsage()).toEqual({ session: 0, device: 0 });
  });
});
