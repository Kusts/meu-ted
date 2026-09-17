import { randomBytes } from 'node:crypto';

/**
 * Broker startup configuration (V4.1 Phase 8, tasks 8.1-8.3a).
 *
 * Production is fail-closed: startup throws when the signing key is
 * missing/weak or when neither Cloudflare Access credentials nor the
 * explicit `BROKER_TRUST_PRIVATE_NETWORK=1` escape hatch is configured.
 * Non-production resolves an ephemeral signing key so local development
 * keeps working without ever falling back to a hardcoded literal.
 */

/** Removed insecure literal — kept as a named constant so tests and the
 *  startup guard can explicitly reject it if it ever reappears in env. */
export const INSECURE_SIGNING_KEY_FALLBACK = 'local-development-signing-key-change-me';

export const MIN_SIGNING_KEY_LENGTH = 32;

export type BrokerEnv = Record<string, string | undefined>;

export type BrokerConfig = {
  isProduction: boolean;
  signingKey: string;
  /** True when the key was generated ephemerally for local dev (never in prod). */
  ephemeralSigningKey: boolean;
  cfAccessClientId?: string;
  cfAccessClientSecret?: string;
  trustPrivateNetwork: boolean;
  instanceCount: number;
  sharedReplayConfigured: boolean;
};

const isTruthyFlag = (value: string | undefined): boolean =>
  value === '1' || value?.toLowerCase() === 'true';

export const isProductionEnv = (env: BrokerEnv): boolean =>
  env.NODE_ENV === 'production' || isTruthyFlag(env.BROKER_PROD);

export const resolveBrokerConfig = (env: BrokerEnv = process.env): BrokerConfig => {
  const isProduction = isProductionEnv(env);
  const rawKey = env.CODEX_SIGNING_KEY?.trim();
  // Ephemeral keys exist only for local dev ergonomics. In production a
  // missing key resolves to '' so assertBrokerConfig fails closed.
  const ephemeralSigningKey = !rawKey && !isProduction;
  const signingKey = rawKey && rawKey.length > 0 ? rawKey : ephemeralSigningKey ? randomBytes(32).toString('hex') : '';
  const instanceCount = Math.max(1, Number(env.BROKER_INSTANCE_COUNT ?? 1) || 1);
  return {
    isProduction,
    signingKey,
    ephemeralSigningKey,
    cfAccessClientId: env.CF_ACCESS_CLIENT_ID,
    cfAccessClientSecret: env.CF_ACCESS_CLIENT_SECRET,
    trustPrivateNetwork: isTruthyFlag(env.BROKER_TRUST_PRIVATE_NETWORK),
    instanceCount,
    sharedReplayConfigured: isTruthyFlag(env.BROKER_SHARED_REPLAY),
  };
};

const hasCloudflareAccessCreds = (cfg: BrokerConfig): boolean =>
  Boolean(cfg.cfAccessClientId?.trim()) && Boolean(cfg.cfAccessClientSecret?.trim());

export const assertBrokerConfig = (cfg: BrokerConfig): void => {
  if (
    !cfg.signingKey ||
    cfg.signingKey === INSECURE_SIGNING_KEY_FALLBACK ||
    cfg.signingKey.length < MIN_SIGNING_KEY_LENGTH
  ) {
    throw new Error(
      'broker startup refused: CODEX_SIGNING_KEY must be a strong secret ' +
        `(>= ${MIN_SIGNING_KEY_LENGTH} chars); insecure defaults are never accepted`,
    );
  }
  if (cfg.isProduction && !hasCloudflareAccessCreds(cfg) && !cfg.trustPrivateNetwork) {
    throw new Error(
      'broker startup refused: production requires Cloudflare Access credentials ' +
        '(CF_ACCESS_CLIENT_ID/CF_ACCESS_CLIENT_SECRET) or explicit BROKER_TRUST_PRIVATE_NETWORK=1',
    );
  }
};

export type ReplayTopology = {
  instanceCount: number;
  storeKind: 'memory' | 'shared';
  sharedReplayConfigured: boolean;
};

/**
 * SPEC §15.3: the in-memory nonce replay store is acceptable only in a
 * singleton deployment. Horizontal scale without shared replay storage
 * fails closed at startup.
 */
export const assertReplayTopology = (topology: ReplayTopology): void => {
  const shared = topology.storeKind === 'shared' || topology.sharedReplayConfigured;
  if (topology.instanceCount > 1 && !shared) {
    throw new Error(
      'broker startup refused: in-memory replay store is only valid for singleton ' +
        'deployments (BROKER_INSTANCE_COUNT=1); configure shared replay storage ' +
        '(BROKER_SHARED_REPLAY=1) before scaling horizontally',
    );
  }
};
