/**
 * Chat attachment + microphone capability gates (SPEC §18, H-09; V4 §7 A1/A2; INV-08).
 *
 * Multimodal is OUT of scope (SPEC §33): no real ingestion pipeline exists,
 * so the UI must not offer image/PDF/audio attachments. This module is the
 * single source of truth for those capabilities.
 *
 * Default is ALL FALSE. When a real ingestion pipeline lands, enable it by
 * setting `NEXT_PUBLIC_TED_ATTACHMENT_INGESTION=1`. Absence or any other
 * value keeps every attachment capability disabled.
 *
 * The microphone gate (V4 T1.1) follows the same call-time pattern: default
 * false, enabled by `NEXT_PUBLIC_TED_MICROPHONE=1` or `=true`. The deploy
 * sets it to `true` (Phase 1); code default stays false. Both the
 * Permissions-Policy header (proxy-utils) and the record button (TedChat)
 * read this same flag, so header and UI can never diverge.
 */

export interface ChatAttachmentCapabilities {
  image: boolean;
  pdf: boolean;
  audio: boolean;
  /** Live voice capture (record button + Permissions-Policy). Default false. */
  microphone: boolean;
}

type EnvLike = Record<string, string | undefined>;

function readEnv(env: EnvLike | undefined, key: string): string | undefined {
  if (!env) return undefined;
  try {
    return env[key];
  } catch {
    return undefined;
  }
}

/** Live read so tests can toggle via `vi.stubEnv` without re-imports. */
export function isMicrophoneEnabled(env?: EnvLike): boolean {
  const source: EnvLike | undefined =
    env ?? (typeof process !== "undefined" ? (process.env as EnvLike) : undefined);
  const value = readEnv(source, "NEXT_PUBLIC_TED_MICROPHONE");
  return value === "1" || value === "true";
}

/** Live read so tests can toggle via `vi.stubEnv` without re-imports. */
export function getChatAttachmentCapabilities(env?: EnvLike): ChatAttachmentCapabilities {
  const source: EnvLike | undefined =
    env ?? (typeof process !== "undefined" ? (process.env as EnvLike) : undefined);
  const enabled = readEnv(source, "NEXT_PUBLIC_TED_ATTACHMENT_INGESTION") === "1";
  return { image: enabled, pdf: enabled, audio: enabled, microphone: isMicrophoneEnabled(source) };
}

/** Build-time snapshot for non-reactive consumers. Prefer the function above in components. */
export const chatAttachmentCapabilities: ChatAttachmentCapabilities =
  getChatAttachmentCapabilities();
