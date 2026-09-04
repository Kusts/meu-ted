import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");

function block(selector: string): string {
  const match = css.match(new RegExp(`${selector}\\s*\\{([^}]+)\\}`));
  if (!match) throw new Error(`CSS block ${selector} not found`);
  return match[1];
}

function token(blockBody: string, name: string): string {
  const match = blockBody.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`token --${name} not found`);
  return match[1].toLowerCase();
}

function luminance(hex: string): number {
  const m = hex.replace("#", "");
  const channels = [0, 2, 4]
    .map((i) => parseInt(m.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const TEXT_TOKENS = ["text-primary", "text-secondary", "text-muted"];
const BACKGROUND_TOKENS = ["bg-canvas", "surface-1", "surface-2"];
const MIN_NORMAL_CONTRAST = 4.5;

describe("globals.css text contrast (P2-8, WCAG 2.1 AA normal text)", () => {
  for (const theme of ["root", "dark"]) {
    describe(`theme ${theme === "root" ? "light (:root)" : "dark (.dark)"}`, () => {
      const body = block(theme === "root" ? ":root" : "\\.dark");
      const texts = Object.fromEntries(
        TEXT_TOKENS.map((t) => [t, token(body, t)]),
      );
      const backgrounds = Object.fromEntries(
        BACKGROUND_TOKENS.map((t) => [t, token(body, t)]),
      );

      for (const textToken of TEXT_TOKENS) {
        for (const bgToken of BACKGROUND_TOKENS) {
          it(`${textToken} >= 4.5:1 over ${bgToken}`, () => {
            const ratio = contrastRatio(texts[textToken], backgrounds[bgToken]);
            expect(ratio).toBeGreaterThanOrEqual(MIN_NORMAL_CONTRAST);
          });
        }
      }
    });
  }
});