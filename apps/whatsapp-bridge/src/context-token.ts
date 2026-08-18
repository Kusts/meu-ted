import { randomUUID } from "node:crypto";

export type BridgeContextClaims = {
  channelActorId: string;
  workspaceId: string;
  chatId: string;
  providerMessageId: string;
  requestId: string;
};

type BridgeContextPayload = {
  iss: "pi-bridge-context";
  aud: "pi-finance-api";
  v: 1;
  sub: string;
  workspace: string;
  chatId: string;
  providerMessageId: string;
  requestId: string;
  jti: string;
  iat: number;
  exp: number;
};

const encoder = new TextEncoder();
const TTL_SECONDS = 5 * 60;

const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const importSigningKey = (secret: string) =>
  crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

const assertClaims = (claims: BridgeContextClaims, secret: string): void => {
  if (!secret.trim()) throw new Error("context token secret is required");
  const values = [
    claims.channelActorId,
    claims.workspaceId,
    claims.chatId,
    claims.providerMessageId,
    claims.requestId,
  ];
  if (values.some((value) => typeof value !== "string" || !value.trim())) {
    throw new Error("context token claims are invalid");
  }
};

export const createBridgeContextToken = async (
  claims: BridgeContextClaims,
  secret: string,
  nowMs = Date.now(),
): Promise<string> => {
  assertClaims(claims, secret);
  const iat = Math.floor(nowMs / 1_000);
  const payload: BridgeContextPayload = {
    iss: "pi-bridge-context",
    aud: "pi-finance-api",
    v: 1,
    sub: claims.channelActorId,
    workspace: claims.workspaceId,
    chatId: claims.chatId,
    providerMessageId: claims.providerMessageId,
    requestId: claims.requestId,
    jti: randomUUID(),
    iat,
    exp: iat + TTL_SECONDS,
  };
  const header = encode({ alg: "HS256", typ: "JWT" });
  const encodedPayload = encode(payload);
  const signingInput = `${header}.${encodedPayload}`;
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signingInput),
  );
  return `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
};
