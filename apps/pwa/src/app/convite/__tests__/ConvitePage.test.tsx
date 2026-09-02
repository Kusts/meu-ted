import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  verifyWorkspaceInvite: vi.fn(),
  verifyAccountInvite: vi.fn(),
  acceptWorkspaceInvite: vi.fn(),
  fetchSession: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithEmail: vi.fn(),
  registerDeviceToken: vi.fn(),
  fetchPendingMe: vi.fn(),
  useSearchParams: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/api/workspaces", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return { ...mod, verifyWorkspaceInvite: mocks.verifyWorkspaceInvite, acceptWorkspaceInvite: mocks.acceptWorkspaceInvite };
});
vi.mock("@/lib/api/auth", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return {
    ...mod,
    verifyAccountInvite: mocks.verifyAccountInvite,
    fetchSession: mocks.fetchSession,
    signUpWithEmail: mocks.signUpWithEmail,
    signInWithEmail: mocks.signInWithEmail,
    registerDeviceToken: mocks.registerDeviceToken,
    fetchPendingMe: mocks.fetchPendingMe,
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => mocks.useSearchParams(),
  usePathname: () => "/convite",
}));

import ConvitePage from "../page";

describe("ConvitePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyWorkspaceInvite.mockResolvedValue({
      email: "convidado@example.com",
      householdId: "household-1",
      role: "member",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    mocks.verifyAccountInvite.mockResolvedValue({
      email: "newuser@example.com",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    mocks.fetchSession.mockResolvedValue({ user: null });
    mocks.acceptWorkspaceInvite.mockResolvedValue({ inviteId: "inv-1", membership: { userId: "u1", householdId: "household-1", role: "member" } });
    mocks.signUpWithEmail.mockResolvedValue({});
    mocks.signInWithEmail.mockResolvedValue({ token: "session-token" });
    mocks.registerDeviceToken.mockResolvedValue({ token: "device-token", deviceId: "dev-1", householdId: "household-1" });
    mocks.useSearchParams.mockReturnValue(new URLSearchParams(`token=${"a".repeat(64)}`));
  });

  it("shows signup form when not logged and token is valid workspace invite", async () => {
    render(<ConvitePage />);
    await waitFor(() => expect(mocks.verifyWorkspaceInvite).toHaveBeenCalledWith("a".repeat(64)));
    expect(await screen.findByText("Crie sua conta para aceitar")).toBeInTheDocument();
    expect(screen.getByDisplayValue("convidado@example.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
  });

  it("shows accept button when logged with matching email (workspace invite)", async () => {
    mocks.fetchSession.mockResolvedValue({ user: { id: "u1", email: "convidado@example.com", name: "Convidado" } });
    render(<ConvitePage />);
    await waitFor(() => expect(mocks.verifyWorkspaceInvite).toHaveBeenCalled());
    expect(await screen.findByText(/Você está logado como/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aceitar convite" })).toBeEnabled();
  });

  it("accepts workspace invite when logged user clicks accept", async () => {
    const user = userEvent.setup();
    mocks.fetchSession.mockResolvedValue({ user: { id: "u1", email: "convidado@example.com", name: "Convidado" } });
    render(<ConvitePage />);
    await screen.findByRole("button", { name: "Aceitar convite" });
    await user.click(screen.getByRole("button", { name: "Aceitar convite" }));
    await waitFor(() => expect(mocks.acceptWorkspaceInvite).toHaveBeenCalledWith("a".repeat(64)));
    expect(await screen.findByText("Convite aceito com sucesso!")).toBeInTheDocument();
  });

  it("creates account and accepts workspace invite when not logged", async () => {
    const user = userEvent.setup();
    render(<ConvitePage />);
    await screen.findByText("Crie sua conta para aceitar");
    await user.type(screen.getByLabelText("Nome"), "Convidado Novo");
    await user.clear(screen.getByLabelText("E-mail"));
    await user.type(screen.getByLabelText("E-mail"), "convidado@example.com");
    await user.type(screen.getByLabelText(/Senha/), "password123");
    await user.click(screen.getByRole("button", { name: "Criar conta e aceitar convite" }));
    await waitFor(() => expect(mocks.signUpWithEmail).toHaveBeenCalledWith({ email: "convidado@example.com", password: "password123", name: "Convidado Novo" }));
    expect(mocks.signInWithEmail).toHaveBeenCalledWith({ email: "convidado@example.com", password: "password123" });
    expect(mocks.registerDeviceToken).toHaveBeenCalled();
    expect(mocks.acceptWorkspaceInvite).toHaveBeenCalledWith("a".repeat(64));
  });

  it("falls back to account invite verification when workspace invite returns invite.not_found", async () => {
    const { ApiError } = await import("@/lib/api/client");
    mocks.verifyWorkspaceInvite.mockRejectedValue(new ApiError(404, "invite.not_found", "invite was not found"));
    render(<ConvitePage />);
    await waitFor(() => expect(mocks.verifyAccountInvite).toHaveBeenCalledWith("a".repeat(64)));
    expect(await screen.findByText("Crie sua conta")).toBeInTheDocument();
    expect(screen.getByDisplayValue("newuser@example.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
  });

  it("shows account invite form and does not call acceptWorkspaceInvite for account tokens", async () => {
    const { ApiError } = await import("@/lib/api/client");
    mocks.verifyWorkspaceInvite.mockRejectedValue(new ApiError(404, "invite.not_found", "invite was not found"));
    const user = userEvent.setup();
    render(<ConvitePage />);
    await waitFor(() => expect(mocks.verifyAccountInvite).toHaveBeenCalled());
    expect(await screen.findByText("Crie sua conta")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nome"), "New User");
    await user.type(screen.getByLabelText(/Senha/), "password123");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    await waitFor(() => expect(mocks.signUpWithEmail).toHaveBeenCalled());
    expect(mocks.acceptWorkspaceInvite).not.toHaveBeenCalled();
  });

  it("shows error when both workspace and account invite are not found", async () => {
    const { ApiError } = await import("@/lib/api/client");
    mocks.verifyWorkspaceInvite.mockRejectedValue(new ApiError(404, "invite.not_found", "invite was not found"));
    mocks.verifyAccountInvite.mockRejectedValue(new ApiError(404, "invite.not_found", "invite was not found"));
    render(<ConvitePage />);
    expect(await screen.findByText(/Convite não encontrado/)).toBeInTheDocument();
  });

it("shows error when token is invalid", async () => {
    const { ApiError } = await import("@/lib/api/client");
    mocks.verifyWorkspaceInvite.mockRejectedValue(new ApiError(404, "invite.not_found", "invite was not found"));
    mocks.verifyAccountInvite.mockRejectedValue(new ApiError(404, "invite.not_found", "invite was not found"));
    render(<ConvitePage />);
    expect(await screen.findByText(/Convite não encontrado/)).toBeInTheDocument();
  });
});
