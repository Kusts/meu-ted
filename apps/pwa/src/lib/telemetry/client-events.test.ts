/**
 * T0.4.7 client event recorder (SPEC §24.7): lightweight client-side counter
 * queue for mic errors. No new service: events persist in localStorage and
 * flush on the next authenticated cycle through the existing
 * adoption/audit channel once the API accepts the event type.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  recordClientEvent,
  getQueuedClientEvents,
  clearQueuedClientEvents,
  flushQueuedClientEvents,
  CLIENT_EVENTS_STORAGE_KEY,
  CLIENT_EVENTS_PATH,
} from "./client-events";

describe("client-events recorder (T0.4.7 mic.error)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("queues a mic.error event with reason code and capability flag", () => {
    recordClientEvent("mic.error", { reason: "denied", microphoneEnabled: true });
    const queued = getQueuedClientEvents();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      type: "mic.error",
      reason: "denied",
      microphoneEnabled: true,
    });
    expect(typeof queued[0].occurredAt).toBe("string");
  });

  it("persists the queue in localStorage across reloads", () => {
    recordClientEvent("mic.error", { reason: "busy", microphoneEnabled: false });
    const raw = localStorage.getItem(CLIENT_EVENTS_STORAGE_KEY);
    expect(raw).toContain("mic.error");
    expect(raw).toContain("busy");
    // A fresh read sees the same queue (durability, not in-memory only).
    expect(getQueuedClientEvents()).toHaveLength(1);
  });

  it("accumulates multiple events and clears on demand", () => {
    recordClientEvent("mic.error", { reason: "denied", microphoneEnabled: true });
    recordClientEvent("mic.error", { reason: "notfound", microphoneEnabled: true });
    expect(getQueuedClientEvents()).toHaveLength(2);
    clearQueuedClientEvents();
    expect(getQueuedClientEvents()).toHaveLength(0);
  });

  it("rejects unknown reason codes (fail-closed contract)", () => {
    expect(() =>
      recordClientEvent("mic.error", {
        reason: "exploded",
        microphoneEnabled: true,
      }),
    ).toThrow();
    expect(getQueuedClientEvents()).toHaveLength(0);
  });
});

describe("client-events flush (FIX-F0 POST /client-events)", () => {
  const ok204 = () => new Response(null, { status: 204 });

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("flushes through POST /client-events via the same-origin proxy (no absolute URL)", async () => {
    recordClientEvent("mic.error", { reason: "denied", microphoneEnabled: true });
    const fetchSpy = vi.fn(async () => ok204());
    vi.stubGlobal("fetch", fetchSpy);

    const flushed = await flushQueuedClientEvents();

    expect(flushed).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(CLIENT_EVENTS_PATH);
    expect(url).not.toMatch(/^https?:\/\//);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({
      eventType: "mic.error",
      payload: { reason: "denied", capability: "on" },
    });
    expect(getQueuedClientEvents()).toHaveLength(0);
  });

  it("maps microphoneEnabled=false to capability off", async () => {
    recordClientEvent("mic.error", { reason: "busy", microphoneEnabled: false });
    const fetchSpy = vi.fn(async () => ok204());
    vi.stubGlobal("fetch", fetchSpy);

    await flushQueuedClientEvents();

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).payload).toMatchObject({ capability: "off" });
  });

  it("keeps the queue durable when the transport fails", async () => {
    recordClientEvent("mic.error", { reason: "denied", microphoneEnabled: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    await expect(flushQueuedClientEvents()).rejects.toThrow();
    expect(getQueuedClientEvents()).toHaveLength(1);
  });

  it("does not touch the network when the queue is empty", async () => {
    const fetchSpy = vi.fn(async () => ok204());
    vi.stubGlobal("fetch", fetchSpy);

    expect(await flushQueuedClientEvents()).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("honors a custom sender and clears only on acknowledged send", async () => {
    recordClientEvent("mic.error", { reason: "denied", microphoneEnabled: true });
    const sender = vi.fn(async () => {});
    await flushQueuedClientEvents(sender);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(getQueuedClientEvents()).toHaveLength(0);

    recordClientEvent("mic.error", { reason: "denied", microphoneEnabled: true });
    const failing = vi.fn(async () => {
      throw new Error("no ack");
    });
    await expect(flushQueuedClientEvents(failing)).rejects.toThrow();
    expect(getQueuedClientEvents()).toHaveLength(1);
  });

  it("storage key stays stable for the apiFetch flush trigger", () => {
    expect(CLIENT_EVENTS_STORAGE_KEY).toBe("pi-finance:client-events");
  });
});

describe("client-events flush concurrency (FIX-F1 single in-flight sender)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("coalesces two simultaneous flushes into a single sender call", async () => {
    recordClientEvent("mic.error", { reason: "denied", microphoneEnabled: true });
    let resolveSender!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveSender = resolve;
    });
    const sender = vi.fn(async () => {
      await gate;
    });

    const first = flushQueuedClientEvents(sender);
    const second = flushQueuedClientEvents(sender);
    resolveSender();
    const [flushedA, flushedB] = await Promise.all([first, second]);

    expect(sender).toHaveBeenCalledTimes(1);
    expect(flushedA).toHaveLength(1);
    expect(flushedB).toHaveLength(1);
    expect(getQueuedClientEvents()).toHaveLength(0);
  });

  it("keeps events appended while the sender is pending (no wipe)", async () => {
    recordClientEvent("mic.error", { reason: "denied", microphoneEnabled: true });
    let resolveSender!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveSender = resolve;
    });
    const sender = vi.fn(async () => {
      await gate;
    });

    const pending = flushQueuedClientEvents(sender);
    // Event recorded DURING the in-flight send — must survive the flush.
    recordClientEvent("mic.error", { reason: "busy", microphoneEnabled: false });
    resolveSender();
    await pending;

    const remaining = getQueuedClientEvents();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ reason: "busy" });
  });

  it("preserves the queue when the sender fails", async () => {
    recordClientEvent("mic.error", { reason: "denied", microphoneEnabled: true });
    const failing = vi.fn(async () => {
      throw new Error("no ack");
    });
    await expect(flushQueuedClientEvents(failing)).rejects.toThrow();
    expect(getQueuedClientEvents()).toHaveLength(1);
    // A retry after the failure still sends the preserved event.
    const retry = vi.fn(async () => {});
    await flushQueuedClientEvents(retry);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(getQueuedClientEvents()).toHaveLength(0);
  });
});
