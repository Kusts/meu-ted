import { describe, it, expect, afterEach, vi } from "vitest";
import { buildPermissionsPolicy } from "../proxy-utils";
import { isMicrophoneEnabled } from "../lib/capabilities";

/**
 * T1.1 (SPEC §7 A1/A2, INV-08 bidirectional): the Permissions-Policy must
 * reflect the microphone capability in BOTH directions.
 */
describe("microphone capability <-> Permissions-Policy contract (T1.1)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("flag on -> policy allows microphone for self", () => {
    expect(isMicrophoneEnabled({ NEXT_PUBLIC_TED_MICROPHONE: "true" })).toBe(true);
    expect(buildPermissionsPolicy(true)).toContain("microphone=(self)");
  });

  it("flag off (default) -> policy denies microphone", () => {
    expect(isMicrophoneEnabled({})).toBe(false);
    expect(buildPermissionsPolicy(false)).toContain("microphone=()");
    expect(buildPermissionsPolicy(false)).not.toContain("microphone=(self)");
  });

  it("camera and geolocation stay blocked in both configurations", () => {
    for (const enabled of [true, false]) {
      const policy = buildPermissionsPolicy(enabled);
      expect(policy).toContain("camera=()");
      expect(policy).toContain("geolocation=()");
    }
  });

  it("no external origin ever receives microphone permission", () => {
    for (const enabled of [true, false]) {
      const policy = buildPermissionsPolicy(enabled);
      const micDirective = policy
        .split(",")
        .map((part) => part.trim())
        .find((part) => part.startsWith("microphone="));
      expect(micDirective).toBeDefined();
      // Only self-contained tokens are allowed: never a URL, wildcard host,
      // or cross-origin value.
      expect(micDirective).not.toMatch(/https?:\/\//);
      expect(micDirective).not.toContain("*");
    }
  });

  it("reads the flag at call time (no module-scope snapshot)", () => {
    vi.stubEnv("NEXT_PUBLIC_TED_MICROPHONE", "true");
    expect(isMicrophoneEnabled()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_TED_MICROPHONE", "");
    expect(isMicrophoneEnabled()).toBe(false);
  });
});
