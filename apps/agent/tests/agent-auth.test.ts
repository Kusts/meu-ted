import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";

describe("G5.1.2 Agent membership pre-handler", () => {
  it("authorizes membership before resolving the workspace Agent", async () => {
    const get = vi.fn(() => ({ fetch: vi.fn(async () => new Response("agent")) }));
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ userId: 'user-1', role: 'member' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: "user-1" } }), { status: 200 }));
    const env = {
      API_ORIGIN: "https://api.example.test",
      AGENT: { idFromName: vi.fn((name: string) => ({ name })), get },
    } as unknown as Env;

    const response = await worker.fetch(new Request("https://agent.example.test/agents/workspace/workspace-1", {
      headers: { cookie: "better-auth.session_token=session", origin: "https://pwa.example.test" },
    }), env);

    expect(response.status).toBe(200);
    const [membershipUrl, membershipInit] = fetchMock.mock.calls[0]!;
    expect(String(membershipUrl)).toBe("https://api.example.test/workspaces/workspace-1/members");
    const forwardedHeaders = (membershipInit as RequestInit).headers;
    expect(forwardedHeaders).toBeInstanceOf(Headers);
    expect(forwardedHeaders instanceof Headers ? forwardedHeaders.get("cookie") : null)
      .toBe("better-auth.session_token=session");
    expect(get).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it("revalidates membership on every workspace message", async () => {
    const get = vi.fn(() => ({ fetch: vi.fn(async () => new Response("agent")) }));
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ userId: 'user-1', role: 'member' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: "user-1" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response("revoked", { status: 403 }));
    const env = {
      API_ORIGIN: "https://api.example.test",
      AGENT: { idFromName: vi.fn((name: string) => ({ name })), get },
    } as unknown as Env;

    const first = await worker.fetch(new Request("https://agent.example.test/agents/workspace/workspace-1/message", {
      method: "POST", headers: { cookie: "better-auth.session_token=session" }, body: "hello",
    }), env);
    const second = await worker.fetch(new Request("https://agent.example.test/agents/workspace/workspace-1/message", {
      method: "POST", headers: { cookie: "better-auth.session_token=session" }, body: "again",
    }), env);

    expect(first.status).toBe(200);
    expect(second.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(get).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it("routes stream and abort URLs through the same authenticated workspace pre-handler", async () => {
    const calls: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ userId: 'user-1', role: 'member' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: "user-1" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ userId: 'user-1', role: 'member' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: "user-1" } }), { status: 200 }));
    const get = vi.fn(() => ({ fetch: async (request: Request) => { calls.push(new URL(request.url).pathname); return new Response("ok"); } }));
    const env = { API_ORIGIN: "https://api.example.test", AGENT: { idFromName: (name: string) => ({ name }), get } } as unknown as Env;

    await worker.fetch(new Request("https://agent.example.test/agents/workspace/w1/message/stream/t1"), env);
    await worker.fetch(new Request("https://agent.example.test/agents/workspace/w1/message/t1/abort", { method: "POST" }), env);
    expect(calls).toEqual(["/agents/workspace/w1/message/stream/t1", "/agents/workspace/w1/message/t1/abort"]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    fetchMock.mockRestore();
  });

  it("routes privacy endpoints through authenticated workspace membership", async () => {
    const calls: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => String(input).includes("/members")
        ? new Response(JSON.stringify({ items: [{ userId: "owner-1", role: "owner" }] }), { status: 200 })
        : new Response(JSON.stringify({ user: { id: "owner-1" } }), { status: 200 }));
    const get = vi.fn(() => ({ fetch: async (request: Request) => { calls.push(new URL(request.url).pathname); return new Response("ok"); } }));
    const env = { API_ORIGIN: "https://api.example.test", AGENT: { idFromName: (name: string) => ({ name }), get } } as unknown as Env;

    await worker.fetch(new Request("https://agent.example.test/agents/workspace/w1/history/export"), env);
    await worker.fetch(new Request("https://agent.example.test/agents/workspace/w1/history", { method: "DELETE" }), env);
    await worker.fetch(new Request("https://agent.example.test/agents/workspace/w1/history/access-log"), env);

    expect(calls).toEqual(["/agents/workspace/w1/history/export", "/agents/workspace/w1/history", "/agents/workspace/w1/history/access-log"]);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    fetchMock.mockRestore();
  });

  it("does not resolve an Agent for a non-member", async () => {
    const get = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("forbidden", { status: 403 }));
    const env = {
      API_ORIGIN: "https://api.example.test",
      AGENT: { idFromName: vi.fn(), get },
    } as unknown as Env;

    const response = await worker.fetch(new Request("https://agent.example.test/agents/workspace/workspace-1"), env);

    expect(response.status).toBe(403);
    expect(get).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
