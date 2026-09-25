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

describe("RootProviders — RUM storage failure never breaks boot (fail-closed, default OFF)", () => {
  it("still reaches the same-origin AuthGate login when localStorage throws", async () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ user: null }), { status: 200 }),
      );
      render(
        <RootProviders>
          <div data-testid="rum-fail-app">App</div>
        </RootProviders>,
      );
      expect(
        await screen.findByRole("button", { name: /Entrar/i }, { timeout: 3000 }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("api-unconfigured-screen")).not.toBeInTheDocument();
      // No React error from the RUM boot path (isRUMEnabled fail-closed).
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      getItemSpy.mockRestore();
      consoleErrorSpy.mockRestore();
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

describe("RootProviders — SSR prerender without env (item 7, no false-unconfigured flash)", () => {
  it("hydrateRoot hydrates actual server HTML: neutral first paint, then login via /api/backend with no mismatch", async () => {
    // Next docs (01-app/02-guides/preventing-flash-before-hydration.md +
    // 01-getting-started/05-server-and-client-components.md): Client
    // Components prerender HTML on the server (window absent) then hydrate
    // in the browser. This test hydrates the REAL renderToString HTML via
    // React hydrateRoot — not a separate render — so a hydration mismatch
    // would surface as console.error + DOM replacement.
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "");
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const { act } = await import("react");
    const { waitFor } = await import("@testing-library/react");
    const realWindow = globalThis.window;
    vi.stubGlobal("window", undefined);
    let html: string;
    try {
      html = renderToString(
        <RootProviders>
          <div data-testid="ssr-app">SSR App Content</div>
        </RootProviders>,
      );
    } finally {
      vi.stubGlobal("window", realWindow);
    }
    // Server HTML (no window, no env) must NOT flash the fail-closed screen:
    // hydration in the browser resolves login through the same-origin proxy.
    expect(html).not.toContain("api-unconfigured-screen");
    expect(html).toContain("root-boot-placeholder");
    // No app content, no auth surface, no mock data in the prerender.
    expect(html).not.toContain("ssr-app");
    expect(html).not.toContain("Entrar");
    expect(html).not.toContain("Workspace pessoal");

    // Hydrate the ACTUAL server HTML in the browser (same empty env): the
    // session probe goes through the same-origin proxy, never a direct host.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: null }), { status: 200 }),
    );
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = html;
    // First paint (pre-hydration DOM): neutral placeholder only.
    expect(
      container.querySelector('[data-testid="root-boot-placeholder"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="ssr-app"]')).toBeNull();
    expect(container.textContent).not.toContain("Entrar");
    expect(
      container.querySelector('[data-testid="api-unconfigured-screen"]'),
    ).toBeNull();

    const rootRef: { current: ReturnType<typeof hydrateRoot> | null } = {
      current: null,
    };
    try {
      await act(async () => {
        rootRef.current = hydrateRoot(
          container,
          // No StrictMode: avoid dev double-effect noise around hydration;
          // the placeholder→login transition is effect-driven either way.
          <RootProviders>
            <div data-testid="ssr-app">SSR App Content</div>
          </RootProviders>,
        );
      });
      // Post-effect: the boot placeholder resolves to login (children stay
      // gated behind AuthGate), proving hydration completed client-side.
      await waitFor(
        () => {
          const loginBtn = Array.from(
            container.querySelectorAll("button"),
          ).find((b) => /entrar/i.test(b.textContent ?? ""));
          expect(loginBtn).toBeTruthy();
        },
        { timeout: 3000 },
      );
      expect(
        container.querySelector('[data-testid="api-unconfigured-screen"]'),
      ).toBeNull();
      expect(container.textContent).not.toContain("Workspace pessoal");
      // No React hydration mismatch warnings on the real SSR→hydrate path.
      const hydrationWarnings = consoleErrorSpy.mock.calls.filter((args) =>
        String(args[0] ?? "").toLowerCase().includes("hydrat"),
      );
      expect(hydrationWarnings).toHaveLength(0);
      // Same-origin contract: the session probe goes to the exact
      // same-origin proxy endpoint — never a direct production origin
      // and never an absolute http(s) URL.
      expect(fetchSpy).toHaveBeenCalled();
      const urls = fetchSpy.mock.calls.map((call) => String(call[0]));
      expect(urls).toContain("/api/backend/auth/session");
      for (const url of urls) {
        expect(url).not.toContain("api.synkroo.com.br");
        expect(url.startsWith("http")).toBe(false);
      }
    } finally {
      try {
        rootRef.current?.unmount();
      } catch {
        /* noop */
      }
      container.remove();
      consoleErrorSpy.mockRestore();
    }
  });
});
