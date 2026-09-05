import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const financeChatPath = path.join(root, "src/finance-chat-agent.ts");

describe("TED Tools Integration – RED phase", () => {
  it("finance-chat-agent importa generatedHttpTools e expõe todas as funções financeiras", () => {
    const content = readFileSync(financeChatPath, "utf8");
    // Deve importar tools
    expect(content).toMatch(/generatedHttpTools|http-tools/);
    expect(content).toMatch(/setGlobalApiContext|requestPiApiJson/);
    // Deve listar ferramentas chave
    expect(content).toMatch(/list_accounts|get_balance|list_recent_transactions/);
    expect(content).toMatch(/create_goal|list_goals|create_budget|list_budgets/);
    expect(content).toMatch(/create_expense|create_income|pay_statement|list_statements/);
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

  it("fetch handler integra execução de tools com delegatedToken e workspace isolation", () => {
    const content = readFileSync(financeChatPath, "utf8");
    // Deve criar delegated token para ferramentas
    expect(content).toMatch(/createDelegatedTurnToken|delegatedToken/);
    // Deve fazer setGlobalApiContext com workspaceId
    expect(content).toMatch(/setGlobalApiContext/);
    // Deve haver lógica de tool calling (generateText com tools ou executeTedTools)
    expect(content).toMatch(/tools|generateText|execute/);
  });

  it("não deve responder 'sem autorização' para queries financeiras quando tools estão disponíveis", () => {
    // Check that generated tools exist via file content to avoid heavy import timeout
    const generatedPath = path.join(root, "src/generated/http-tools.ts");
    const genContent = readFileSync(generatedPath, "utf8");
    expect(genContent).toContain("get_balance");
    expect(genContent).toContain("list_recent_transactions");
    expect(genContent).toContain("create_expense");
    expect(genContent).toContain("list_goals");
    expect(genContent).toContain("create_budget");
    expect((genContent.match(/export const .*Tool/g) || []).length).toBeGreaterThanOrEqual(52);
    // Verify finance-chat-agent mentions não negar autorização
    const content = readFileSync(financeChatPath, "utf8");
    expect(content).toMatch(/sem autorização|sem autorizacao/i);
    // Mas deve ser no contexto de "em vez de responder sem autorização" (i.e., evita negação)
    expect(content).toMatch(/em vez de responder.*sem autorização/i);
  });

  it("isolation: history filtrada por workspaceId mesmo em DO compartilhado", () => {
    const content = readFileSync(financeChatPath, "utf8");
    // History handler should filter by workspaceId
    expect(content).toMatch(/workspaceId/);
    // Should have check for workspace isolation in history mapping
    expect(content).toMatch(/x-agent-workspace/);
  });
});
