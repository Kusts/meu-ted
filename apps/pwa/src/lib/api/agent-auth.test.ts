import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAgentConnectionToken, clearAgentConnectionTokenCache } from "./agent-auth";
import * as client from "./client";

describe("agent-auth", () => {
  afterEach(() => {
    clearAgentConnectionTokenCache();
    vi.restoreAllMocks();
  });

  it("sends explicit X-Workspace-Id header when requesting connection token", async () => {
    const apiFetchSpy = vi.spyOn(client, "apiFetch").mockResolvedValue({
      token: "signed-connection-token-xyz",
      expiresIn: 120,
    });

    const token = await fetchAgentConnectionToken("workspace-test-123");

    expect(token).toBe("signed-connection-token-xyz");
    expect(apiFetchSpy).toHaveBeenCalledWith("/auth/agent-token", {
      method: "POST",
      headers: {
        "X-Workspace-Id": "workspace-test-123",
      },
    });
  });
});
