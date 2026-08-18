import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FETCH_TIMEOUT_MS, rawFetch } from "./fetch-core";

describe("rawFetch timeout boundary", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("combines a caller AbortSignal with the timeout signal", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      }),
    );
    const caller = new AbortController();
    const request = rawFetch("/slow", { signal: caller.signal });
    const rejection = expect(request).rejects.toBe("caller cancelled");

    caller.abort("caller cancelled");
    await rejection;
    expect(fetchMock).toHaveBeenCalledWith("/slow", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("aborts without a caller signal when the timeout expires", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      }),
    );
    const request = rawFetch("/slow");
    const rejection = expect(request).rejects.toThrow("HTTP request timed out");

    await vi.advanceTimersByTimeAsync(DEFAULT_FETCH_TIMEOUT_MS);
    await rejection;
  });
});
