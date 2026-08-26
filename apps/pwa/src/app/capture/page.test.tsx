import { act, render } from "@/lib/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureBridge, buildCaptureDescription } from "./capture-bridge";

const navigation = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  useSearchParams: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: navigation.useSearchParams,
}));

vi.mock("@/components/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

describe("capture bridge", () => {
  beforeEach(() => {
    navigation.useSearchParams.mockReturnValue(navigation.searchParams);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["text", "Mercado", "Mercado"],
    ["title", "Comprovante", "Comprovante"],
    ["url", "https://example.com/receipt", "https://example.com/receipt"],
  ])("builds description from %s", (key, value, expected) => {
    const params = new URLSearchParams([[key, value]]);

    expect(buildCaptureDescription(params)).toBe(expected);
  });

  it("prefers text over title and url", () => {
    const params = new URLSearchParams({
      text: "Mercado",
      title: "Comprovante",
      url: "https://example.com/receipt",
    });

    expect(buildCaptureDescription(params)).toBe("Mercado");
  });

  it("opens an expense once and normalizes the URL", async () => {
    navigation.searchParams = new URLSearchParams({
      kind: "expense",
      text: "Mercado",
    });
    navigation.useSearchParams.mockReturnValue(navigation.searchParams);
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");
    const replaceState = vi.spyOn(window.history, "replaceState");

    const { rerender } = render(<CaptureBridge />);
    await act(async () => undefined);
    rerender(<CaptureBridge />);

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({
      type: "pwa:open-tx",
      detail: { kind: "expense", description: "Mercado" },
    });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/");
  });

  it("opens an empty expense when no share parameters exist", async () => {
    navigation.searchParams = new URLSearchParams();
    navigation.useSearchParams.mockReturnValue(navigation.searchParams);

    const dispatchEvent = vi.spyOn(window, "dispatchEvent");
    render(<CaptureBridge />);
    await act(async () => undefined);

    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({
      type: "pwa:open-tx",
      detail: { kind: "expense", description: "" },
    });
  });
});
