import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TedChatLauncher } from "../TedChatLauncher";

// Overlay store is module-level (useSyncExternalStore); drive it with a
// mutable flag so tests can simulate sheets/dialogs being open.
const overlay = vi.hoisted(() => ({ open: false }));

vi.mock("@/lib/ui/overlay-a11y", () => ({
  useIsOverlayOpen: () => overlay.open,
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

// Launcher-owned chat is stubbed: this suite covers the launcher behavior
// (disclosure semantics, overlay hiding), not the chat internals.
vi.mock("../TedChat", () => ({
  TedChat: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="ted-chat-stub">
        <button type="button" onClick={onClose}>
          fechar chat
        </button>
      </div>
    ) : null,
}));

describe("TedChatLauncher", () => {
  beforeEach(() => {
    overlay.open = false;
  });

  it("renders the FAB as a dialog disclosure with an accessible name", () => {
    render(<TedChatLauncher />);
    const fab = screen.getByRole("button", { name: "Abrir assistente TED" });
    // SPEC §24: the FAB opens a dialog — announce it instead of pretending a
    // menu pattern (aria-expanded is not applicable: the button unmounts).
    expect(fab).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("keeps a >= 44px touch target (56px FAB)", () => {
    render(<TedChatLauncher />);
    const fab = screen.getByRole("button", { name: "Abrir assistente TED" });
    expect(fab.className).toMatch(/h-14/);
    expect(fab.className).toMatch(/w-14/);
  });

  it("opens the TED chat when the FAB is activated", async () => {
    const user = userEvent.setup();
    render(<TedChatLauncher />);
    await user.click(screen.getByRole("button", { name: "Abrir assistente TED" }));
    expect(screen.getByTestId("ted-chat-stub")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Abrir assistente TED" }),
    ).not.toBeInTheDocument();
  });

  it("returns to the FAB after the chat closes", async () => {
    const user = userEvent.setup();
    render(<TedChatLauncher />);
    await user.click(screen.getByRole("button", { name: "Abrir assistente TED" }));
    await user.click(screen.getByText("fechar chat"));
    expect(screen.getByRole("button", { name: "Abrir assistente TED" })).toBeInTheDocument();
    expect(screen.queryByTestId("ted-chat-stub")).not.toBeInTheDocument();
  });

  it("hides the FAB while any overlay is open (A1)", () => {
    overlay.open = true;
    render(<TedChatLauncher />);
    expect(
      screen.queryByRole("button", { name: "Abrir assistente TED" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("ted-chat-stub")).not.toBeInTheDocument();
  });
});
