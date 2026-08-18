import { randomUUID } from "node:crypto";
import { getCapabilityMode } from "./capability-flags.js";

export const isUUID = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const isDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

export const idempotencyKey = (provided: string | undefined, toolCallId: string): string =>
  provided?.trim() || toolCallId || randomUUID();

export const capabilityDisabled = (capability: string): { success: false; reason: string } | null =>
  getCapabilityMode(capability) === "disabled"
    ? { success: false, reason: `Capability ${capability} disabled by feature flag` }
    : null;
