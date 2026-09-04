import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@serwist/sw", () => ({ installSerwist: vi.fn() }));
vi.mock("serwist", () => ({ CacheFirst: class {}, NetworkFirst: class {} }));

import { SHELL_PRECACHE_ENTRIES } from "./sw";

const shellFile = (url: string) =>
  readFileSync(path.resolve(process.cwd(), `public${url}`));

describe("offline shell precache revisions (P1-6)", () => {
  it("never precaches the offline shell with a null revision", () => {
    expect(SHELL_PRECACHE_ENTRIES.map((e) => e.url)).toEqual([
      "/offline-shell.html",
      "/offline-shell.js",
    ]);
    for (const entry of SHELL_PRECACHE_ENTRIES) {
      expect(entry.revision).not.toBeNull();
      expect(entry.revision).toMatch(/^sha256-[0-9a-f]{64}$/);
    }
  });

  it("revisions match the sha256 of the bundled shell files", () => {
    for (const { url, revision } of SHELL_PRECACHE_ENTRIES) {
      const hash = createHash("sha256").update(shellFile(url)).digest("hex");
      expect(revision).toBe(`sha256-${hash}`);
    }
  });
});
