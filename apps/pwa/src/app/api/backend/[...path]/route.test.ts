import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("same-origin backend proxy", () => {
  afterEach(() => vi.restoreAllMocks());

  it("forwards the auth cookie and preserves upstream Set-Cookie", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ session: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "better-auth.session_token=opaque; Path=/; HttpOnly; Secure; SameSite=Lax",
        },
      }),
    );

    const request = new Request("https://pwa.example/api/backend/auth/sign-in/email", {
      method: "POST",
      headers: {
        cookie: "better-auth.session_token=old",
        origin: "https://pwa.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "user@example.com", password: "secret" }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["auth", "sign-in", "email"] }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("better-auth.session_token=opaque");
    expect(await response.json()).toEqual({ session: true });
    expect(upstream).toHaveBeenCalledWith(
      "https://api.synkroo.com.br/auth/sign-in/email",
      expect.objectContaining({ method: "POST", body: expect.any(ArrayBuffer), headers: expect.any(Headers) }),
    );
    const [, init] = upstream.mock.calls[0] ?? [];
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe(JSON.stringify({ email: "user@example.com", password: "secret" }));
    const headers = init?.headers as Headers;
    expect(headers.get("cookie")).toBe("better-auth.session_token=old");
    expect(headers.get("origin")).toBe("https://pwa.example");
  });
});
