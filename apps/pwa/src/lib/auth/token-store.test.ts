import { describe, it, expect, beforeEach } from "vitest";
import { getToken, setToken, clearToken } from "./token-store";

describe("token-store", () => {
  beforeEach(() => clearToken());
  it("starts with null", () => {
    expect(getToken()).toBeNull();
  });
  it("sets and gets", () => {
    setToken("abc-123");
    expect(getToken()).toBe("abc-123");
  });
  it("clears", () => {
    setToken("x");
    clearToken();
    expect(getToken()).toBeNull();
  });
});
