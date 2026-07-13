import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthGate } from "../AuthGate";

// ─── localStorage mock ──────────────────────────────────────────────────────
const store: Record<string, string> = {};
beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(
    (k) => store[String(k)] ?? null,
  );
  vi.spyOn(Storage.prototype, "setItem").mockImplementation((k, v) => {
    store[String(k)] = String(v);
  });
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation((k) => {
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
  it("shows register screen when no token", async () => {
    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );
    // Wait for loading → register transition
    const input = await screen.findByPlaceholderText(
      /Nome do dispositivo/,
      {},
      { timeout: 3000 },
    );
    expect(input).toBeInTheDocument();
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

  it("shows register with expired msg when token returns 401", async () => {
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
      screen.getByPlaceholderText(/Nome do dispositivo/),
    ).toBeInTheDocument();
  });
});
