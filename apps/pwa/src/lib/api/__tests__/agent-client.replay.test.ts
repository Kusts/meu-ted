import { afterEach, describe, expect, it, vi } from "vitest";
import { sendAgentMessage, fetchAgentHistory } from "../agent-client";
import * as agentAuth from "../agent-auth";

vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
});

const okTurn = (output = "ok") =>
  new Response(JSON.stringify({ turnId: "t1", status: "completed", output }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const replayed = () =>
  new Response(JSON.stringify({ code: "agent.token_replayed", message: "Connection token already consumed" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });

describe("H-05/C-01: single-use token retry + cache hygiene no client", () => {
  it("usa token fresco por chamada (single-use C-01)", async () => {
    const tokenSpy = vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("fresh-1");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => okTurn());

    await sendAgentMessage("ws-1", "oi");
    expect(tokenSpy).toHaveBeenCalledWith("ws-1", true);
  });

  it("401 agent.token_replayed: limpa o cache, busca fresco e tenta 1x", async () => {
    const tokenSpy = vi
      .spyOn(agentAuth, "fetchAgentConnectionToken")
      .mockResolvedValueOnce("stale-token")
      .mockResolvedValueOnce("fresh-token");
    const clearSpy = vi.spyOn(agentAuth, "clearAgentConnectionTokenCache");
    const seen: Array<string | null> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      seen.push((init?.headers as Record<string, string>)?.["x-agent-connection-token"] ?? null);
      return seen.length === 1 ? replayed() : okTurn("recuperado");
    });

    const result = await sendAgentMessage("ws-1", "oi");
    expect(result.output).toBe("recuperado");
    expect(clearSpy).toHaveBeenCalled();
    expect(tokenSpy).toHaveBeenCalledTimes(2);
    expect(tokenSpy).toHaveBeenNthCalledWith(2, "ws-1", true);
    expect(seen).toEqual(["stale-token", "fresh-token"]);
  });

  it("replay persistente: tenta só 1x e propaga o código", async () => {
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("t");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => replayed());

    const err = await sendAgentMessage("ws-1", "oi").catch((e) => e) as { code?: string; status?: number };
    expect(err.code).toBe("agent.token_replayed");
    expect(err.status).toBe(401);
  });

  it("401 não-replay: limpa o cache e propaga sem retry", async () => {
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("t");
    const clearSpy = vi.spyOn(agentAuth, "clearAgentConnectionTokenCache");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ code: "agent.workspace_forbidden", message: "Sem acesso." }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(fetchAgentHistory("ws-1")).rejects.toThrow("Sem acesso.");
    expect(clearSpy).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
