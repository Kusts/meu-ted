import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signInWithEmail, registerDeviceToken, verifyDeviceToken } from "./auth";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "http://localhost:3333");
});

afterEach(() => {
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
});
