import { describe, it, expect, vi, beforeEach } from "vitest";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { ProcessManager } from "./process-manager.js";
import type { ChildProcess } from "node:child_process";

class MockChildProcess extends EventEmitter {
  public stdin = new PassThrough();
  public stdout = new PassThrough();
  public stderr = new PassThrough();
  public killed = false;

  constructor() {
    super();
    this.stdin.on("data", (chunk: Buffer) => {
      const line = chunk.toString("utf8").trim();
      for (const single of line.split("\n")) {
        if (!single) continue;
        try {
          const parsed = JSON.parse(single);
          this.stdout.write(JSON.stringify({
            id: parsed.id,
            type: "response",
            text: `Eco: ${parsed.content}`,
            success: true,
          }) + "\n");
        } catch {
          // ignore
        }
      }
    });
  }

  public kill(signal?: string): boolean {
    this.killed = true;
    this.emit("exit", 0, signal ?? "SIGTERM");
    return true;
  }
}

describe("ProcessManager Subprocess Pool", () => {
  let spawnSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spawnSpy = vi.fn(() => new MockChildProcess() as unknown as ChildProcess);
  });

  it("creates and caches runners per household key", async () => {
    const manager = new ProcessManager({
      runnerOptions: { spawnFn: spawnSpy },
    });

    const res1 = await manager.send("msg 1", "5511999999999", {
      source: "whatsapp",
      chatId: "chat-1",
      providerMessageId: "msg-1",
      householdId: "household-A",
    });

    const res2 = await manager.send("msg 2", "5511999999999", {
      source: "whatsapp",
      chatId: "chat-1",
      providerMessageId: "msg-2",
      householdId: "household-A",
    });

    const res3 = await manager.send("msg 3", "5511888888888", {
      source: "whatsapp",
      chatId: "chat-2",
      providerMessageId: "msg-3",
      householdId: "household-B",
    });

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res3.success).toBe(true);
    expect(res1.data?.message).toBe("Eco: msg 1");
    expect(res3.data?.message).toBe("Eco: msg 3");

    // 2 unique households -> spawned 2 processes
    expect(spawnSpy).toHaveBeenCalledTimes(2);

    await manager.shutdown();
  });

  it("enforces max concurrent executions limit", async () => {
    const manager = new ProcessManager({
      runnerOptions: { spawnFn: spawnSpy, timeoutMs: 100 },
      maxConcurrent: 1,
    });

    // Create a hung runner process
    const hungProc = new EventEmitter() as any;
    hungProc.stdin = new PassThrough();
    hungProc.stdout = new PassThrough();
    hungProc.stderr = new PassThrough();
    hungProc.killed = false;
    hungProc.kill = () => { hungProc.killed = true; return true; };

    spawnSpy.mockReturnValueOnce(hungProc);

    const firstCall = manager.send("hung msg", "5511", {
      source: "whatsapp",
      chatId: "c1",
      providerMessageId: "m1",
    });

    // Second call exceeds concurrency limit
    const secondCall = await manager.send("excess msg", "5511", {
      source: "whatsapp",
      chatId: "c1",
      providerMessageId: "m2",
    });

    expect(secondCall.success).toBe(false);
    expect(secondCall.reason).toBe("Concurrency limit reached");

    await firstCall;
    await manager.shutdown();
  });

  it("handles clean shutdown and terminates all child processes", async () => {
    const manager = new ProcessManager({
      runnerOptions: { spawnFn: spawnSpy },
    });

    await manager.send("hi", "5511", {
      source: "whatsapp",
      chatId: "c1",
      providerMessageId: "m1",
      householdId: "household-1",
    });

    await manager.shutdown();

    const callAfterShutdown = await manager.send("hi again", "5511", {
      source: "whatsapp",
      chatId: "c1",
      providerMessageId: "m2",
    });

    expect(callAfterShutdown.success).toBe(false);
    expect(callAfterShutdown.reason).toContain("shutting down");
  });
});
