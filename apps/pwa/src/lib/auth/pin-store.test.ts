import { describe, it, expect, beforeEach } from "vitest";
import { hashPin, verifyPin, isPinSet, clearPin } from "./pin-store";

describe("pin-store", () => {
  beforeEach(() => clearPin());

  it("isPinSet false initially", () => {
    expect(isPinSet()).toBe(false);
  });

  it("hashPin sets, verifyPin passes", async () => {
    await hashPin("1234");
    expect(isPinSet()).toBe(true);
    expect(await verifyPin("1234")).toBe(true);
  });

  it("verifyPin rejects wrong PIN", async () => {
    await hashPin("1234");
    expect(await verifyPin("0000")).toBe(false);
  });

  it("clearPin removes stored PIN", async () => {
    await hashPin("9999");
    clearPin();
    expect(isPinSet()).toBe(false);
  });
});
