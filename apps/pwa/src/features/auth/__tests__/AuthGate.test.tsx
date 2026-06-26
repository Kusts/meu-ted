import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("shows unlock screen when token exists and pin is set", async () => {
    store["pi-finance:token"] = "existing-token";
    store["pi-finance:pin-hash"] = "deadbeef";
    store["pi-finance:pin-salt"] = "0102030405060708090a0b0c0d0e0f10";

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );

    // Should show PIN input after token validation passes
    const pinBtn = await screen.findByText("0", {}, { timeout: 3000 });
    expect(pinBtn).toBeInTheDocument();
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

  it("goes through setup-pin and unlocks", async () => {
    store["pi-finance:token"] = "token";
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ deviceId: "d1", householdId: "h1" }),
    } as Response);

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );

    // Token exists but no PIN → shows setup-pin ("Crie seu PIN")
    await screen.findByText("Crie seu PIN", {}, { timeout: 3000 });

    // Enter PIN "1234" → click Próximo
    const user = userEvent.setup();
    await user.click(screen.getByText("1"));
    await user.click(screen.getByText("2"));
    await user.click(screen.getByText("3"));
    await user.click(screen.getByText("4"));
    await user.click(screen.getByText("Próximo"));

    // Confirm in — "Confirme o PIN"
    await screen.findByText("Confirme o PIN", {}, { timeout: 1000 });
    await user.click(screen.getByText("1"));
    await user.click(screen.getByText("2"));
    await user.click(screen.getByText("3"));
    await user.click(screen.getByText("4"));
    await user.click(screen.getByText("Salvar PIN"));

    // Should now show app content (unlocked)
    const app = await screen.findByTestId("app", {}, { timeout: 3000 });
    expect(app).toBeInTheDocument();
  });
});
