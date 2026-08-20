import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuthGate } from "../AuthGate";
import { useSession } from "@/lib/auth/session-context";
import { ApiError } from "@/lib/api/client";

// ─── localStorage mock ──────────────────────────────────────────────────────
const store: Record<string, string> = {};
beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.spyOn(window.localStorage, "getItem").mockImplementation(
    (k) => store[String(k)] ?? null,
  );
  vi.spyOn(window.localStorage, "setItem").mockImplementation((k, v) => {
    store[String(k)] = String(v);
  });
  vi.spyOn(window.localStorage, "removeItem").mockImplementation((k) => {
    delete store[String(k)];
  });
});


// ─── crypto mock (subtle + getRandomValues) ────────────────────────────────
beforeEach(() => {
  vi.stubGlobal("crypto", {
    ...globalThis.crypto,
    getRandomValues: (arr: Uint8Array) =>
      arr.forEach((_, i) => {
        arr[i] = i + 1;
      }),
    subtle: {
      importKey: vi.fn().mockResolvedValue({}),
      deriveBits: vi
        .fn()
        .mockResolvedValue(new Uint8Array(32).fill(0xaa)),
    },
  });
});

// ─── fetch mock ─────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "http://localhost:3333");
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ deviceId: "d1", householdId: "h1" }),
  } as Response);
});


afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthGate", () => {
  it("shows login screen when no token exists", async () => {
    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );
    // Wait for loading → login transition
    const emailInput = await screen.findByPlaceholderText(
      /seu\.email@exemplo\.com/,
      {},
      { timeout: 3000 },
    );
    expect(emailInput).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/••••••••/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Entrar/i })).toBeInTheDocument();
  });

  it("shows app content when token exists and is valid", async () => {
    store["pi-finance:token"] = "valid-token";

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );

    const app = await screen.findByTestId("app", {}, { timeout: 3000 });
    expect(app).toBeInTheDocument();
  });

  it("shows login screen with expired msg when token returns 401", async () => {
    store["pi-finance:token"] = "expired-token";
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ code: "auth.invalid_token" }),
    } as Response);

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );

    const txt = await screen.findByText(
      /Sessão antiga expirada/,
      {},
      { timeout: 3000 },
    );
    expect(txt).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/seu\.email@exemplo\.com/),
    ).toBeInTheDocument();
  });
});

function SessionProbe() {
  const { expireSession } = useSession();
  return (
    <>
      <div data-testid="app">App Content</div>
      <button type="button" onClick={() => expireSession("Sessão expirada pelo teste.")}>
        Expire
      </button>
    </>
  );
}

describe("AuthGate login + session flows", () => {
  it("logs in with email/password, registers device token, and shows app on submit", async () => {
    vi.mocked(fetch)
      // 1. POST /auth/sign-in/email
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ user: { email: "walis@example.com" } }),
      } as Response)
      // 2. POST /auth/devices/register
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ token: "new-device-token", deviceId: "d1", householdId: "h1" }),
      } as Response);

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );

    const emailInput = await screen.findByPlaceholderText(/seu\.email@exemplo\.com/, {}, { timeout: 3000 });
    const passInput = screen.getByPlaceholderText(/••••••••/);

    fireEvent.change(emailInput, { target: { value: "walis@example.com" } });
    fireEvent.change(passInput, { target: { value: "password123!" } });
    fireEvent.click(screen.getByRole("button", { name: /Entrar/i }));

    const app = await screen.findByTestId("app", {}, { timeout: 3000 });
    expect(app).toBeInTheDocument();
    expect(store["pi-finance:token"]).toBe("new-device-token");
  });

  it("shows error when login fails with 401 (invalid credentials)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ code: "auth.invalid_credentials", message: "Invalid password" }),
    } as Response);

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );

    const emailInput = await screen.findByPlaceholderText(/seu\.email@exemplo\.com/, {}, { timeout: 3000 });
    const passInput = screen.getByPlaceholderText(/••••••••/);

    fireEvent.change(emailInput, { target: { value: "walis@example.com" } });
    fireEvent.change(passInput, { target: { value: "wrongPass" } });
    fireEvent.click(screen.getByRole("button", { name: /Entrar/i }));

    const err = await screen.findByText(/E-mail ou senha incorretos/i, {}, { timeout: 3000 });
    expect(err).toBeInTheDocument();
  });

  it("shows default error when login fails (network)", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );

    const emailInput = await screen.findByPlaceholderText(/seu\.email@exemplo\.com/, {}, { timeout: 3000 });
    const passInput = screen.getByPlaceholderText(/••••••••/);

    fireEvent.change(emailInput, { target: { value: "walis@example.com" } });
    fireEvent.change(passInput, { target: { value: "password123!" } });
    fireEvent.click(screen.getByRole("button", { name: /Entrar/i }));

    const err = await screen.findByText(/Falha ao realizar login/i, {}, { timeout: 3000 });
    expect(err).toBeInTheDocument();
  });

  it("expires session via context and returns to login screen", async () => {
    store["pi-finance:token"] = "valid-token";
    render(
      <AuthGate>
        <SessionProbe />
      </AuthGate>,
    );
    expect(await screen.findByTestId("app", {}, { timeout: 3000 })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Expire"));
    expect(await screen.findByText(/Sessão expirada pelo teste/i, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(await screen.findByPlaceholderText(/seu\.email@exemplo\.com/, {}, { timeout: 3000 })).toBeInTheDocument();
  });
});
