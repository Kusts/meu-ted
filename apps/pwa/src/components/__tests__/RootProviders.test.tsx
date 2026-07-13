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

describe("RootProviders — no API env", () => {
  it("renders content directly without AuthGate (mock mode)", async () => {
    // No API env → bypass AuthGate entirely → app content visible immediately
    render(
      <RootProviders>
        <div data-testid="mock-app">Mock App Content</div>
      </RootProviders>,
    );

    const content = await screen.findByTestId("mock-app", {}, { timeout: 3000 });
    expect(content).toBeInTheDocument();
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
