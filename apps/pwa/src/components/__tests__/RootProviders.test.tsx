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

describe("RootProviders — no API env (fail closed)", () => {
  it("renders the fail-closed configuration screen instead of app content", async () => {
    render(
      <RootProviders>
        <div data-testid="mock-app">Mock App Content</div>
      </RootProviders>,
    );

    const notice = await screen.findByTestId("api-unconfigured-screen", {}, { timeout: 3000 });
    expect(notice).toBeInTheDocument();
    expect(screen.queryByTestId("mock-app")).not.toBeInTheDocument();
  });

  it("renders no mock workspace data and no AuthGate login in unconfigured mode", async () => {
    render(
      <RootProviders>
        <div data-testid="mock-app">Mock App Content</div>
      </RootProviders>,
    );

    await screen.findByTestId("api-unconfigured-screen", {}, { timeout: 3000 });
    expect(screen.queryByText(/Workspace pessoal/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Entrar/i })).not.toBeInTheDocument();
  });

  it("does NOT make any fetch call (no /auth/devices/register)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(
      <RootProviders>
        <div>App</div>
      </RootProviders>,
    );

    // Wait briefly to let any potential effects resolve
    await new Promise((r) => setTimeout(r, 100));

    // No HTTP requests should have been made
    expect(fetchSpy).not.toHaveBeenCalled();
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
    expect(await screen.findByRole("button", { name: /Entrar/i }, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByTestId("cfg-app")).not.toBeInTheDocument();
  });
});

describe("RootProviders — forced empty env", () => {
  it("fails closed when API env is an empty string", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "");
    render(
      <RootProviders>
        <div data-testid="nocfg-app">NoCfg App</div>
      </RootProviders>,
    );
    await screen.findByTestId("api-unconfigured-screen", {}, { timeout: 3000 });
    expect(screen.queryByTestId("nocfg-app")).not.toBeInTheDocument();
  });
});
