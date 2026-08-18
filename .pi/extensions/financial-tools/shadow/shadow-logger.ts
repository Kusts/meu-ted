import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ShadowEvent } from "./shadow-read.js";

type Env = Record<string, string | undefined>;

const MAX_LINE_LENGTH = 4096;
const defaultPath = "data/shadow/read-divergences.jsonl";

const getPath = (env: Env): string => env.PI_SHADOW_LOG_PATH?.trim() || defaultPath;

const boundedEvent = (event: ShadowEvent): ShadowEvent => ({
  ...event,
  capability: event.capability.slice(0, 80),
  error: event.error?.slice(0, 200),
});

export const createShadowLogger = (env: Env = process.env): ((event: ShadowEvent) => void) => {
  const path = getPath(env);
  const seen = new Set<string>();
  return (event) => {
    try {
      const key = JSON.stringify(event);
      if (seen.has(key)) return;
      if (seen.size >= 10_000) seen.clear();
      seen.add(key);
      mkdirSync(dirname(path), { recursive: true });
      const line = JSON.stringify({ timestamp: new Date().toISOString(), ...boundedEvent(event) });
      const safeLine = line.length <= MAX_LINE_LENGTH
        ? line
        : JSON.stringify({ timestamp: new Date().toISOString(), kind: event.kind, capability: event.capability.slice(0, 80), error: "event_too_large" });
      appendFileSync(path, `${safeLine}\n`, { encoding: "utf8" });
    } catch {
      // Shadow telemetry must never affect the API-owned response.
    }
  };
};
