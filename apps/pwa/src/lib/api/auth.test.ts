import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signInWithEmail, registerDeviceToken, verifyDeviceToken, signOut, fetchSession } from "./auth";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "http://localhost:3333");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("PWA Auth API client", () => {
  it("calls /auth/sign-in/email with JSON credentials", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ token: "sess-123", user: { email: "test@example.com" } }),
    } as Response);

    const result = await signInWithEmail({ email: "test@example.com", password: "pwd" });
    expect(result.token).toBe("sess-123");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3333/auth/sign-in/email",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "test@example.com", password: "pwd" }),
      }),
    );
  });

  it("calls /auth/devices/register with bearer authorization when session token provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ token: "dev-456", deviceId: "d1", householdId: "h1" }),
    } as Response);

    const result = await registerDeviceToken("sess-123");
    expect(result.token).toBe("dev-456");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3333/auth/devices/register",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sess-123",
        }),
      }),
    );
  });

  it("verifies device token via /auth/devices/me", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ deviceId: "d1", householdId: "h1" }),
    } as Response);

    const result = await verifyDeviceToken("dev-456");
    expect(result).toEqual({ deviceId: "d1", householdId: "h1" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3333/auth/devices/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-device-token": "dev-456",
        }),
      }),
    );
  });

  it("signs out through the cookie session without sending a device bearer", async () => {
    vi.stubEnv("NEXT_PUBLIC_LEGACY_BEARER_COMPAT", "off");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as Response);

    await signOut();

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3333/auth/sign-out",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    const [, request] = fetchSpy.mock.calls[0]!;
    expect((request?.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined();
    expect((request?.headers as Record<string, string> | undefined)?.["x-device-token"]).toBeUndefined();
  });

  describe("fetchSession canonical principal (FIX-SESSION-USER-ID)", () => {
    function mockSessionBody(body: unknown) {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => body,
      } as Response);
    }

    it.each([
      ["empty object", {}],
      ["missing id", { email: "user@example.com", name: "U" }],
      ["empty-string id", { id: "", email: "user@example.com", name: "U" }],
      ["whitespace-only id", { id: "   ", email: "user@example.com", name: "U" }],
      ["non-string id", { id: 123, email: "user@example.com", name: "U" }],
      ["null user", null],
    ])("2xx with malformed user (%s) → unauthenticated with user null", async (_label, user) => {
      mockSessionBody({ user });
      const res = await fetchSession();
      expect(res.user).toBeNull();
      expect(res.status).toBe("unauthenticated");
    });

    it("2xx with valid canonical user → authenticated binding the exact server user id", async () => {
      const user = { id: "user-canonical-1", email: "user@example.com", name: "U" };
      mockSessionBody({ user });
      const res = await fetchSession();
      expect(res.status).toBe("authenticated");
      expect(res.user).toEqual(user);
    });
  });
});
