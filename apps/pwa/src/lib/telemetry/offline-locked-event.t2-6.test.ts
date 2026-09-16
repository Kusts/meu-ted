/**
 * T2.6 RED — offline.locked client event (T0.4.4, SPEC §24.4).
 *
 * Baseline: client-events.ts only knows mic.error. Fails until the
 * recorder accepts offline.locked with { offlineSubjectId, ageBand } and
 * maps it to the POST /client-events envelope the API already accepts
 * (strict UUID subject + closed age-band enum, server-bound to the
 * session household).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  recordClientEvent,
  getQueuedClientEvents,
  flushQueuedClientEvents,
} from "./client-events";

const SUBJECT = "11111111-2222-4333-8444-555555555555";

describe("offline.locked client event (RED on baseline)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queues offline.locked with subject + age band", () => {
    recordClientEvent("offline.locked", {
      offlineSubjectId: SUBJECT,
      ageBand: "1-7d",
    });
    const queued = getQueuedClientEvents();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      type: "offline.locked",
      offlineSubjectId: SUBJECT,
      ageBand: "1-7d",
    });
    expect(typeof queued[0]!.occurredAt).toBe("string");
  });

  it("rejects a non-UUID subject (fail-closed, never logs free text)", () => {
    expect(() =>
      recordClientEvent("offline.locked", {
        offlineSubjectId: "not-a-uuid",
        ageBand: "1-7d",
      }),
    ).toThrow();
    expect(getQueuedClientEvents()).toHaveLength(0);
  });

  it("rejects an age band outside the closed enum", () => {
    expect(() =>
      recordClientEvent("offline.locked", {
        offlineSubjectId: SUBJECT,
        ageBand: "2-hours",
      }),
    ).toThrow();
    expect(getQueuedClientEvents()).toHaveLength(0);
  });

  it("flushes offline.locked through the canonical POST envelope", async () => {
    recordClientEvent("offline.locked", {
      offlineSubjectId: SUBJECT,
      ageBand: "7-30d",
    });
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchSpy);

    await flushQueuedClientEvents();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      eventType: "offline.locked",
      payload: { offlineSubjectId: SUBJECT, ageBand: "7-30d" },
    });
    expect(getQueuedClientEvents()).toHaveLength(0);
  });
});
