import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ThemeProvider } from "../theme-provider";
import { useTheme } from "../use-theme";

function TestComponent() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved-theme">{resolvedTheme}</span>
      <button onClick={() => setTheme("light")}>Set Light</button>
      <button onClick={() => setTheme("dark")}>Set Dark</button>
      <button onClick={() => setTheme("system")}>Set System</button>
      <button onClick={toggleTheme}>Toggle Theme</button>
    </div>
  );
}

describe("ThemeProvider & useTheme", () => {
  let matchMediaListeners: ((e: { matches: boolean }) => void)[] = [];

  beforeEach(() => {
    matchMediaListeners = [];
    localStorage.clear();
    document.documentElement.className = "";

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("dark") ? false : true,
      media: query,
      onchange: null,
      addListener: vi.fn((listener) => matchMediaListeners.push(listener)),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_, listener) => matchMediaListeners.push(listener)),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to dark theme when nothing is stored in localStorage", () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("reads stored theme from localStorage on initial render", () => {
    localStorage.setItem("pi-theme", "light");

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("allows changing theme to light and updates localStorage and documentElement class", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    await user.click(screen.getByText("Set Light"));

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
    expect(localStorage.getItem("pi-theme")).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggles between dark and light themes", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider defaultTheme="dark">
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");

    await user.click(screen.getByText("Toggle Theme"));
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);

    await user.click(screen.getByText("Toggle Theme"));
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("resolves system theme based on matchMedia preference", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("dark") ? true : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_, listener) => matchMediaListeners.push(listener)),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    await user.click(screen.getByText("Set System"));

    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("pi-theme")).toBe("system");
  });

  it("listens to system theme changes when theme is system", async () => {
    let isDark = false;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: isDark,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_, listener) => matchMediaListeners.push(listener)),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    await user.click(screen.getByText("Set System"));
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);

    // Simulate OS switching to dark mode
    isDark = true;
    act(() => {
      matchMediaListeners.forEach((listener) => listener({ matches: true }));
    });

    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("provides safe fallback when useTheme is called outside ThemeProvider", () => {
    render(<TestComponent />);
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
  });
});
