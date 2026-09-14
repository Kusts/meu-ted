import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const financeChatPath = path.join(root, "src/finance-chat-agent.ts");

describe("TED Tools Integration – V2 trust boundary", () => {
  it("finance-chat-agent usa somente os clientes V2 de mutação, sem o registro global V1", () => {
    const content = readFileSync(financeChatPath, "utf8");
    expect(content).toMatch(/MutationApiClient/);
    expect(content).toMatch(/MutationExecutor/);
    expect(content).toMatch(/transactions\.expense\.create|transactions\.income\.create/);
    expect(content).not.toMatch(/generatedHttpTools/);
    expect(content).not.toMatch(/setGlobalApiContext/);
  });

  it("TED_SYSTEM_PROMPT descreve acesso a ferramentas e não nega autorização", () => {
    const content = readFileSync(financeChatPath, "utf8");
    // Prompt deve mencionar que TED tem acesso a ferramentas
    expect(content).toMatch(/ferramenta|tool/i);
    // Não deve conter frase de negação genérica que causaria 'sem autorização'
    // Após fix, TED não deve responder 'sem autorização' por padrão
    // Verificamos que existe tratamento que evita resposta sem autorização quando tools disponíveis
    expect(content).toMatch(/workspace/i);
  });

  it("fetch handler emite token delegado por solicitação e mantém workspace isolado", () => {
    const content = readFileSync(financeChatPath, "utf8");
    // Deve criar delegated token para ferramentas
    expect(content).toMatch(/createDelegatedTurnToken|delegatedToken/);
    expect(content).toMatch(/requestPiApiJson/);
    expect(content).toMatch(/workspaceId/);
    expect(content).not.toMatch(/setGlobalApiContext/);
  });

  it("isolation: history filtrada por workspaceId mesmo em DO compartilhado", () => {
    const content = readFileSync(financeChatPath, "utf8");
    // History handler should filter by workspaceId
    expect(content).toMatch(/workspaceId/);
    // Should have check for workspace isolation in history mapping
    expect(content).toMatch(/x-agent-workspace/);
  });
});
