import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { TedChat } from "../TedChat";
import { TedMessage } from "../TedMessage";
import * as agentAuth from "@/lib/api/agent-auth";

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
  return { ...actual, useWorkspace: () => mockWs, useWorkspaceSafe: () => mockWs };
});

vi.mock("@/lib/api/agent-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/agent-client")>();
  return {
    ...actual,
    fetchAgentHistory: vi.fn().mockResolvedValue([]),
    sendAgentMessage: vi.fn().mockResolvedValue({ turnId: "t", status: "completed" }),
    uploadAttachment: vi.fn().mockResolvedValue({ url: "https://cdn.test/img.png" }),
  };
});

describe("TedChat – áudio e anexos (imagem, PDF)", () => {
  beforeEach(() => {
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("mock-token");
    // Mock MediaRecorder on both globalThis and window.
    // NOTE (SPEC §17): construtor fiel via `function` + `this` — um
    // mockImplementation com arrow não é construível com `new`, e o hook
    // corretamente recusa o estado "recording" nesse caso.
    const mockRecorder = vi.fn(function (this: {
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
      state: string;
      ondataavailable: null;
      onstop: (() => void) | null;
    }) {
      this.state = "inactive";
      this.ondataavailable = null;
      this.onstop = null;
      this.addEventListener = vi.fn();
      this.removeEventListener = vi.fn();
      this.start = vi.fn(() => {
        this.state = "recording";
      });
      const self = this;
      this.stop = vi.fn(() => {
        // Simulate onstop triggering
        self.state = "inactive";
        if (self.onstop) self.onstop();
      });
    });
    (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder = mockRecorder;
    (window as unknown as { MediaRecorder?: unknown }).MediaRecorder = mockRecorder as unknown as typeof MediaRecorder;
    // Ensure navigator.mediaDevices.getUserMedia resolves
    const mockStream = { getTracks: () => [{ stop: vi.fn() }] };
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", {
        value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
        writable: true,
        configurable: true,
      });
    } else {
      vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(mockStream as unknown as MediaStream);
    }
  });

  it("renderiza botões de áudio, imagem e PDF", async () => {
    render(<TedChat open={true} onClose={vi.fn()} />);
    expect(await screen.findByRole("button", { name: /gravar áudio|microfone|áudio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /anexar imagem|imagem/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /anexar pdf|pdf/i })).toBeInTheDocument();
  });

  it("possui inputs hidden com accept correto para imagem e pdf", async () => {
    const { container } = render(<TedChat open={true} onClose={vi.fn()} />);
    const imageInput = container.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement | null;
    const pdfInput = container.querySelector('input[type="file"][accept*="pdf"]') as HTMLInputElement | null;
    expect(imageInput).not.toBeNull();
    expect(pdfInput).not.toBeNull();
    expect(imageInput?.accept).toMatch(/image\//);
    expect(pdfInput?.accept).toMatch(/pdf/);
  });

  it("ao selecionar imagem, mostra preview e envia com mensagem", async () => {
    const user = userEvent.setup();
    const { container } = render(<TedChat open={true} onClose={vi.fn()} />);
    const imageInput = container.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
    expect(imageInput).not.toBeNull();
    const file = new File(["fake-image"], "foto.png", { type: "image/png" });
    await user.upload(imageInput, file);
    await waitFor(() => {
      expect(container.innerHTML).toMatch(/foto\.png|preview|object-cover/i);
    });
  });

  it("botão de gravar áudio alterna estado de gravação", async () => {
    const user = userEvent.setup();
    render(<TedChat open={true} onClose={vi.fn()} />);
    const micBtn = await screen.findByRole("button", { name: /gravar áudio|microfone|áudio/i });
    await user.click(micBtn);
    // Should show gravando state or change aria-label to Parar
    await waitFor(() => {
      const html = document.body.innerHTML;
      const btn = document.querySelector('button[aria-label*="Parar"], button[aria-label*="parar"]');
      expect(html.match(/gravando|parar|recording/i) || btn).toBeTruthy();
    });
  });
});

describe("TedMessage – renderização de anexos", () => {
  it("renderiza imagem quando message possui attachment de imagem", () => {
    const msg = {
      id: "m1",
      actorId: "user-1",
      role: "user",
      content: "Veja minha nota",
      createdAt: new Date().toISOString(),
      isOwn: true,
      attachments: [{ type: "image" as const, url: "https://cdn.test/img.png", name: "nota.png" }],
    } as unknown as Parameters<typeof TedMessage>[0]["message"];
    const { container } = render(<TedMessage message={msg} isCurrentUser={true} senderName="Você" />);
    const img = container.querySelector('img[src="https://cdn.test/img.png"]');
    expect(img).not.toBeNull();
  });

  it("renderiza áudio player quando attachment é áudio", () => {
    const msg = {
      id: "m2",
      actorId: "user-1",
      role: "user",
      content: "",
      createdAt: new Date().toISOString(),
      isOwn: true,
      attachments: [{ type: "audio" as const, url: "https://cdn.test/audio.webm", name: "audio.webm" }],
    } as unknown as Parameters<typeof TedMessage>[0]["message"];
    const { container } = render(<TedMessage message={msg} isCurrentUser={true} senderName="Você" />);
    const audio = container.querySelector('audio[src="https://cdn.test/audio.webm"]');
    expect(audio).not.toBeNull();
  });

  it("renderiza link de PDF quando attachment é pdf", () => {
    const msg = {
      id: "m3",
      actorId: "user-1",
      role: "user",
      content: "Segue extrato",
      createdAt: new Date().toISOString(),
      isOwn: true,
      attachments: [{ type: "pdf" as const, url: "https://cdn.test/doc.pdf", name: "extrato.pdf" }],
    } as unknown as Parameters<typeof TedMessage>[0]["message"];
    const { container } = render(<TedMessage message={msg} isCurrentUser={true} senderName="Você" />);
    const link = container.querySelector('a[href="https://cdn.test/doc.pdf"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toMatch(/extrato\.pdf|pdf/i);
  });
});
