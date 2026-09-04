import { describe, it, expect, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Plus_Jakarta_Sans: () => ({ variable: "--font-plus-jakarta-sans" }),
  Space_Grotesk: () => ({ variable: "--font-space-grotesk" }),
}));

describe("viewport", () => {
  // Importing the root layout is heavy under full-suite coverage instrumentation,
  // so these tests get a generous timeout (module is cached across tests).
  it("uses viewportFit cover so iOS standalone safe areas apply", async () => {
    const { viewport } = await import("@/app/layout");
    expect(viewport.viewportFit).toBe("cover");
  }, 60_000);

  it("keeps scheme-aware theme colors", async () => {
    const { viewport } = await import("@/app/layout");
    expect(viewport.themeColor).toBeDefined();
    expect(viewport.themeColor).toHaveLength(2);
  }, 60_000);
});
