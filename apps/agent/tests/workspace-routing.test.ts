import { describe, expect, it, vi } from "vitest";
import { getAgentByName } from "../src/index";

describe("G5.1.4 workspace Durable Object identity", () => {
  it("uses one stable singleton name per workspace for personal and shared modes", () => {
    const idFromName = vi.fn((name: string) => ({ name }));
    const namespace = { idFromName, get: vi.fn() };

    getAgentByName(namespace, "personal-workspace");
    getAgentByName(namespace, "personal-workspace");
    getAgentByName(namespace, "shared-workspace");

    expect(idFromName.mock.calls.map(([name]) => name)).toEqual([
      "personal-workspace",
      "personal-workspace",
      "shared-workspace",
    ]);
  });
});
