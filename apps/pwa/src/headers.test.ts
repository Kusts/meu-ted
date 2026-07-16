// Cloudflare _headers contract test — validates the built header rules.
import { describe, it, expect } from "vitest";
import fs from "node:fs";

const HEADERS_PATH = ".open-next/assets/_headers";

function parseHeaders(text: string): Array<{ path: string; headers: Record<string, string> }> {
  const rules: Array<{ path: string; headers: Record<string, string> }> = [];
  let current: { path: string; headers: Record<string, string> } | null = null;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("/_") || trimmed.startsWith("*.") || trimmed.startsWith("/")) {
      if (current) rules.push(current);
      current = { path: trimmed, headers: {} };
    } else if (current && trimmed.includes(":")) {
      const colonIdx = trimmed.indexOf(":");
      const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
      current.headers[key] = trimmed.slice(colonIdx + 1).trim();
    }
  }
  if (current) rules.push(current);
  return rules;
}

describe("Cloudflare Assets _headers", () => {
  let rules: ReturnType<typeof parseHeaders>;

  beforeAll(() => {
    rules = parseHeaders(fs.readFileSync(HEADERS_PATH, "utf-8"));
  });

  it("_headers file exists in build output", () => {
    expect(fs.existsSync(HEADERS_PATH)).toBe(true);
  });

  it("has immutable cache rule for /_next/static/* (only content-hashed assets)", () => {
    const rule = rules.find((r) => r.path === "/_next/static/*");
    expect(rule).toBeDefined();
    expect(rule!.headers["cache-control"]).toMatch(/immutable/);
    expect(rule!.headers["cache-control"]).toMatch(/max-age=31536000/);
  });

  it("has private, no-store rule for *.html", () => {
    const rule = rules.find((r) => r.path === "*.html");
    expect(rule).toBeDefined();
    expect(rule!.headers["cache-control"]).toMatch(/private/);
    expect(rule!.headers["cache-control"]).toMatch(/no-store/);
  });

  it("has no-cache rule for /sw.js", () => {
    const rule = rules.find((r) => r.path === "/sw.js");
    expect(rule).toBeDefined();
    expect(rule!.headers["cache-control"]).toMatch(/no-cache/);
  });

  it("has NO broad .js/.css asset rules (only /_next/static/*)", () => {
    const broad = rules.filter((r) => r.path.startsWith("/*."));
    expect(broad).toHaveLength(0);
  });

  it("has NO API path rules (API should not be cached)", () => {
    const apiRules = rules.filter((r) => r.path.includes("/api/"));
    expect(apiRules).toHaveLength(0);
  });
});
