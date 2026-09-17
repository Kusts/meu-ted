import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { RootProviders } from "../RootProviders";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", undefined as unknown as string);
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("RootProviders — no API env (V4.1 same-origin default, SPEC §12.6)", () => {
  it("renders the AuthGate login instead of the unconfigured screen (browser defaults to /api/backend)", async () => {
    // T2.5 session-first boot probes GET /auth/session (no device token stored).
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: null }), { status: 200 }),
    );
    render(
      <RootProviders>
        <div data-testid="mock-app">Mock App Content</div>
      </RootProviders>,
    );

    expect(await screen.findByRole("button", { name: /Entrar/i }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByTestId("api-unconfigured-screen")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mock-app")).not.toBeInTheDocument();
  });

  it("renders no mock workspace data in same-origin mode", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: null }), { status: 200 }),
    );
    render(
      <RootProviders>
        <div data-testid="mock-app">Mock App Content</div>
      </RootProviders>,
    );

    await screen.findByRole("button", { name: /Entrar/i }, { timeout: 3000 });
    expect(screen.queryByText(/Workspace pessoal/i)).not.toBeInTheDocument();
  });

  it("probes the session through the same-origin proxy (no direct host)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: null }), { status: 200 }),
    );

    render(
      <RootProviders>
        <div>App</div>
      </RootProviders>,
    );

    await screen.findByRole("button", { name: /Entrar/i }, { timeout: 3000 });

    expect(fetchSpy).toHaveBeenCalled();
    for (const call of fetchSpy.mock.calls) {
      expect(String(call[0])).not.toContain("api.synkroo.com.br");
    }
  });
});

describe("RootProviders — API env configured", () => {
  it("wraps content in AuthGate when API configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    // T2.5 session-first boot probes GET /auth/session (no device token stored).
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: null }), { status: 200 }),
    );
    render(
      <RootProviders>
        <div data-testid="cfg-app">Cfg App</div>
      </RootProviders>,
    );
    // API configured → AuthGate path renders (login UI after the session probe, children gated)
    expect(await screen.findByRole("button", { name: /Entrar/i }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByTestId("cfg-app")).not.toBeInTheDocument();
  });
});

describe("RootProviders — forced empty env (V4.1 same-origin default, SPEC §12.6)", () => {
  it("still boots through the same-origin proxy when API env is an empty string", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: null }), { status: 200 }),
    );
    render(
      <RootProviders>
        <div data-testid="nocfg-app">NoCfg App</div>
      </RootProviders>,
    );
    await screen.findByRole("button", { name: /Entrar/i }, { timeout: 3000 });
    expect(screen.queryByTestId("nocfg-app")).not.toBeInTheDocument();
  });
});
