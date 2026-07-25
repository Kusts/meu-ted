import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

import { GET } from "./route";
import { getCloudflareContext } from "@opennextjs/cloudflare";

describe("pwa-control GET", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.PWA_SW_ENABLED;
  });

  it("enabled=true when cloudflare env PWA_SW_ENABLED is 'true'", async () => {
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: { PWA_SW_ENABLED: "true" } } as never);
    const res = await GET();
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect((await res.json()).enabled).toBe(true);
  });

  it("enabled=false when cloudflare env PWA_SW_ENABLED is 'false'", async () => {
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: { PWA_SW_ENABLED: "false" } } as never);
    const res = await GET();
    expect((await res.json()).enabled).toBe(false);
  });

  it("falls back to process.env when cloudflare context throws", async () => {
    vi.mocked(getCloudflareContext).mockRejectedValue(new Error("no ctx"));
    process.env.PWA_SW_ENABLED = "false";
    const res = await GET();
    expect((await res.json()).enabled).toBe(false);
    delete process.env.PWA_SW_ENABLED;
  });

  it("enabled=true by default when no env set", async () => {
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as never);
    const res = await GET();
    expect((await res.json()).enabled).toBe(true);
  });
});
