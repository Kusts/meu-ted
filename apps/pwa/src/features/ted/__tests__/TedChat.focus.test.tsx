import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { TedChat } from "../TedChat";
import { TedChatLauncher } from "../TedChatLauncher";
import { getFocusableElements } from "@/lib/ui/overlay-a11y";

// SPEC §21 (H2): the TED chat dialog must manage focus via the shared
// overlay primitive — initial focus on the message field, trap, restore to
// the launcher FAB, and Escape that never interrupts an active mic flow.

vi.mock("@/lib/auth/workspace-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/workspace-context")>();
  const mockWs = {
    workspaces: [{ id: "ws-1", name: "Minhas Finanças", kind: "shared" as const, role: "owner" }],
    activeWorkspace: { id: "ws-1", name: "Minhas Finanças", kind: "shared" as const, role: "owner" },
    members: [{ userId: "user-1", name: "Walisson", email: "a@example.com", role: "owner" }],
    loading: false,
    membersLoading: false,
    error: null,
    selectWorkspace: vi.fn(),
    refreshWorkspaces: vi.fn(),
    refreshMembers: vi.fn(),
    createWorkspace: vi.fn(),
    inviteMember: vi.fn(),
    acceptInvite: vi.fn(),
    removeMember: vi.fn(),
    leave: vi.fn(),
  };
  return {
    ...actual,
    useWorkspace: () => mockWs,
    useWorkspaceSafe: () => mockWs,
  };
});

vi.mock("@/lib/api/agent-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/agent-client")>();
  return {
    ...actual,
    fetchAgentHistory: vi.fn().mockResolvedValue([]),
    sendAgentMessage: vi.fn().mockResolvedValue({ turnId: "t", status: "completed" }),
    renewAgentSession: vi.fn().mockResolvedValue({ ok: true, sessionId: "s2" }),
  };
});

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

// Minimal MediaRecorder double so the mic button can reach `recording`.
function installMediaMocks() {
  const trackStop = vi.fn();
  const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia },
    writable: true,
    configurable: true,
  });
  const MockRecorder = vi.fn(function (this: unknown) {
    const self = this as { state: string; onstop: (() => void) | null; start: () => void; stop: () => void };
    self.state = "inactive";
    self.onstop = null;
    self.start = vi.fn(() => {
      self.state = "recording";
    });
    self.stop = vi.fn(() => {
      self.state = "inactive";
      self.onstop?.();
    });
    return self;
  });
  (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder = MockRecorder;
  (window as unknown as { MediaRecorder?: unknown }).MediaRecorder =
    MockRecorder as unknown as typeof MediaRecorder;
  (URL as unknown as { createObjectURL?: unknown }).createObjectURL = vi.fn(() => "blob:mock-audio");
  (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL = vi.fn();
}

async function renderOpenChat() {
  render(<TedChat open onClose={vi.fn()} />);
  const dialog = await screen.findByRole("dialog", { name: "Chat com TED" });
  return dialog;
}

afterEach(() => {
  document.querySelectorAll("[inert]").forEach((el) => el.removeAttribute("inert"));
});

describe("TedChat focus management (SPEC §21)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves initial focus to the message input", async () => {
    await renderOpenChat();
    expect(screen.getByLabelText("Mensagem para o assistente")).toHaveFocus();
  });

  it("traps Tab cycling inside the chat dialog in both directions", async () => {
    const dialog = await renderOpenChat();
    const focusables = getFocusableElements(dialog);
    expect(focusables.length).toBeGreaterThanOrEqual(2);

    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("keeps focus inside the dialog when Tab is pressed from a child repeatedly", async () => {
    const dialog = await renderOpenChat();
    const focusables = getFocusableElements(dialog);
    for (let i = 0; i < focusables.length + 2; i += 1) {
      fireEvent.keyDown(document, { key: "Tab" });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("closes on Escape when the chat is idle", async () => {
    const onClose = vi.fn();
    render(<TedChat open onClose={onClose} />);
    await screen.findByRole("dialog", { name: "Chat com TED" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on Escape while recording (mic flow owns the keyboard)", async () => {
    installMediaMocks();
    // V4 T1.1: the record button only renders with the mic capability on.
    vi.stubEnv("NEXT_PUBLIC_TED_MICROPHONE", "true");
    try {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TedChat open onClose={onClose} />);
    await screen.findByRole("dialog", { name: "Chat com TED" });

    await user.click(screen.getByRole("button", { name: "Gravar áudio" }));
    expect(await screen.findByText("gravando…")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Chat com TED" })).toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("TedChat focus restore via launcher (SPEC §21)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores focus to the launcher FAB after the chat closes", async () => {
    const user = userEvent.setup();
    render(<TedChatLauncher />);

    const fab = screen.getByRole("button", { name: "Abrir assistente TED" });
    await user.click(fab);
    await screen.findByRole("dialog", { name: "Chat com TED" });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: "Chat com TED" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Abrir assistente TED" }),
    ).toHaveFocus();
  });
});
