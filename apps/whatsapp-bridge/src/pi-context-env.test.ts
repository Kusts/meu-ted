import { describe, expect, it } from "vitest";
import { getPiContextEnv } from "./pi-client-factory.js";

describe("Pi context environment", () => {
  it("creates a request-scoped env for the current token", () => {
    expect(getPiContextEnv("token-a")).toEqual({ PI_CONTEXT_TOKEN: "token-a" });
    expect(getPiContextEnv("token-b")).toEqual({ PI_CONTEXT_TOKEN: "token-b" });
    expect(getPiContextEnv(undefined)).toEqual({});
  });
  it("keeps concurrent token environments isolated", async () => {
    const [envA, envB] = await Promise.all([
      Promise.resolve(getPiContextEnv("token-a")),
      Promise.resolve(getPiContextEnv("token-b")),
    ]);
    expect(envA.PI_CONTEXT_TOKEN).toBe("token-a");
    expect(envB.PI_CONTEXT_TOKEN).toBe("token-b");
  });
});
