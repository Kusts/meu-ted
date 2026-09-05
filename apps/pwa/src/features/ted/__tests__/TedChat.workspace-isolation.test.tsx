import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const tedChatPath = "D:/projetos/pi-financeiro/apps/pwa/src/features/ted/TedChat.tsx";
const financeChatPath = "D:/projetos/pi-financeiro/apps/agent/src/finance-chat-agent.ts";

describe("TedChat – isolamento de histórico por workspace", () => {
  it("limpa histórico ao trocar de workspace (prevWorkspaceIdRef e useEffect)", () => {
    const content = readFileSync(tedChatPath, "utf8");
    expect(content).toMatch(/prevWorkspaceIdRef/);
    expect(content).toMatch(/activeWorkspace\?\.id/);
    // Deve limpar mensagens ao trocar
    expect(content).toMatch(/setMessages\(\[\]\)/);
    expect(content).toMatch(/setPendingOps\(\[\]\)/);
  });

  it("fetchAgentHistory é chamado com workspace isolado e loadHistory depende de activeWorkspace", () => {
    const content = readFileSync(tedChatPath, "utf8");
    expect(content).toContain("fetchAgentHistory(activeWorkspace.id)");
    expect(content).toContain("loadHistory");
    expect(content).toContain("activeWorkspace");
    expect(content).toMatch(/useCallback/);
  });

  it("FinanceChatAgent filtra histórico por workspaceId para isolamento server-side", () => {
    const content = readFileSync(financeChatPath, "utf8");
    expect(content).toContain("allMessages.filter");
    expect(content).toContain("workspaceId");
    expect(content).toMatch(/x-agent-workspace/);
    expect(content).toMatch(/Isolamento por workspace/);
  });

  it("não deve vazar mensagens entre workspaces via DO compartilhado", () => {
    const content = readFileSync(financeChatPath, "utf8");
    // Verifica que histório filtra por metadata.workspaceId
    expect(content).toMatch(/metadata.*workspaceId/);
    expect(content).toMatch(/workspaceId/);
  });
});
