import { describe, it, expect, vi, beforeEach } from "vitest";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { AgentRunner } from "./agent-runner.js";
import type { ChildProcess } from "node:child_process";

class MockChildProcess extends EventEmitter {
  public stdin = new PassThrough();
  public stdout = new PassThrough();
  public stderr = new PassThrough();
  public killed = false;

  public kill(signal?: string): boolean {
    this.killed = true;
    this.emit("exit", 0, signal ?? "SIGTERM");
    return true;
  }
}

describe("AgentRunner Subprocess Communication", () => {
  let mockProc: MockChildProcess;
  let spawnSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockProc = new MockChildProcess();
    spawnSpy = vi.fn(() => mockProc as unknown as ChildProcess);
  });

  it("spawns agent subprocess with configured parameters", () => {
    const runner = new AgentRunner({
      command: "custom-pi",
      args: ["--mode", "rpc", "--fast"],
      cwd: "/custom/path",
      env: { PI_CUSTOM_VAR: "test" },
      spawnFn: spawnSpy,
    });

    runner.start();
    expect(runner.isRunning()).toBe(true);
    expect(spawnSpy).toHaveBeenCalledWith("custom-pi", ["--mode", "rpc", "--fast"], expect.objectContaining({
      cwd: "/custom/path",
      env: expect.objectContaining({ PI_CUSTOM_VAR: "test" }),
      stdio: ["pipe", "pipe", "pipe"],
    }));
  });

  it("sends NDJSON message to stdin and parses corresponding stdout response", async () => {
    const runner = new AgentRunner({ spawnFn: spawnSpy });
    runner.start();

    // Catch the message written to stdin and echo an NDJSON response to stdout
    mockProc.stdin.on("data", (chunk: Buffer) => {
      const line = chunk.toString("utf8").trim();
      const parsed = JSON.parse(line);
      const response = {
        id: parsed.id,
        type: "response",
        text: "💸 Anotado: R$ 50 no Mercado.",
        success: true,
      };
      mockProc.stdout.write(JSON.stringify(response) + "\n");
    });

    const res = await runner.sendMessage("gastei 50 no mercado", {
      source: "whatsapp",
      chatId: "chat-123",
      providerMessageId: "msg-123",
    });

    expect(res.success).toBe(true);
    expect(res.text).toBe("💸 Anotado: R$ 50 no Mercado.");
  });

  it("times out if agent takes too long and returns a fallback message", async () => {
    const runner = new AgentRunner({
      spawnFn: spawnSpy,
      timeoutMs: 50,
    });
    runner.start();

    const res = await runner.sendMessage("hello");
    expect(res.success).toBe(false);
    expect(res.reason).toContain("timed out");
    expect(res.text).toContain("demorou muito para responder");
  });

  it("handles unexpected process exit and notifies pending callers", async () => {
    const runner = new AgentRunner({ spawnFn: spawnSpy });
    runner.start();

    const pendingPromise = runner.sendMessage("test message");

    // Simulate sudden crash
    mockProc.emit("exit", 1, null);

    const res = await pendingPromise;
    expect(res.success).toBe(false);
    expect(res.text).toContain("reiniciado");
    expect(runner.isRunning()).toBe(false);
  });

  it("ignores malformed output on stdout without crashing", async () => {
    const runner = new AgentRunner({ spawnFn: spawnSpy });
    const malformedEvents: string[] = [];
    runner.on("malformed_output", (l) => malformedEvents.push(l));
    runner.start();

    mockProc.stdout.write("this is not json\n");

    expect(malformedEvents).toEqual(["this is not json"]);
    expect(runner.isRunning()).toBe(true);
  });

  it("adversarial: handles rapid burst messages concurrently", async () => {
    const runner = new AgentRunner({ spawnFn: spawnSpy });
    runner.start();

    mockProc.stdin.on("data", (chunk: Buffer) => {
      const line = chunk.toString("utf8").trim();
      for (const single of line.split("\n")) {
        if (!single) continue;
        const parsed = JSON.parse(single);
        mockProc.stdout.write(JSON.stringify({
          id: parsed.id,
          type: "response",
          text: `Reply to: ${parsed.content}`,
          success: true,
        }) + "\n");
      }
    });

    const promises = Array.from({ length: 5 }, (_, i) =>
      runner.sendMessage(`burst message ${i}`),
    );

    const results = await Promise.all(promises);
    expect(results).toHaveLength(5);
    results.forEach((r, i) => {
      expect(r.success).toBe(true);
      expect(r.text).toBe(`Reply to: burst message ${i}`);
    });
  });

  it("gracefully stops child process on stop()", async () => {
    const runner = new AgentRunner({ spawnFn: spawnSpy });
    runner.start();
    expect(runner.isRunning()).toBe(true);

    await runner.stop();
    expect(runner.isRunning()).toBe(false);
    expect(mockProc.killed).toBe(true);
  });
});
