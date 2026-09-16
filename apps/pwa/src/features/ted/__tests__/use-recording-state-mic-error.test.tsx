import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@/lib/test-utils";
import { useRecordingState } from "../use-recording-state";
import {
  getQueuedClientEvents,
  clearQueuedClientEvents,
} from "@/lib/telemetry/client-events";

/**
 * T0.4.7 wiring (SPEC §24.7): the mic permission-error path queues a
 * `mic.error` client event with the reason code and the capability flag.
 */
describe("useRecordingState – mic.error emission (T0.4.7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearQueuedClientEvents();
    localStorage.clear();
    vi.stubEnv("NEXT_PUBLIC_TED_MICROPHONE", "true");
    (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi
          .fn()
          .mockRejectedValue(new DOMException("denied", "NotAllowedError")),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("permission denial queues mic.error with reason denied + capability on", async () => {
    const { result } = renderHook(() => useRecordingState());
    await act(async () => {
      await result.current.start();
    });
    await waitFor(() => expect(result.current.state).toBe("error"));
    const queued = getQueuedClientEvents();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      type: "mic.error",
      reason: "denied",
      microphoneEnabled: true,
    });
  });

  it("missing device queues mic.error with reason notfound", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi
          .fn()
          .mockRejectedValue(new DOMException("no device", "NotFoundError")),
      },
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useRecordingState());
    await act(async () => {
      await result.current.start();
    });
    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(getQueuedClientEvents()[0]).toMatchObject({ reason: "notfound" });
  });
});
