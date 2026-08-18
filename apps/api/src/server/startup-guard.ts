export interface StartupConfig {
  authSecret: string | null;
  databaseUrl: string | null;
  schemaValid: boolean;
  inviteDeliveryConfigured?: boolean;
  requireVapid?: boolean;
  vapidConfigured?: boolean;
}

/**
 * Phase 0.1.4: validates that production-critical config is present.
 * Throws if AUTH_SECRET, DATABASE_URL, or schema are missing/invalid.
 */
export const validateStartupConfig = (cfg: StartupConfig): void => {
  if (!cfg.authSecret) {
    throw new Error('FATAL: AUTH_SECRET is required. Refusing to start without authentication secret.');
  }
  if (!cfg.databaseUrl) {
    throw new Error('FATAL: DATABASE_URL is required. Refusing to start without database configuration.');
  }
  if (!cfg.schemaValid) {
    throw new Error('FATAL: Database schema is missing or invalid. Refusing to start.');
  }
  // Invite routes are registered only when delivery is configured. The core
  // authentication and push paths must not be blocked by the optional mailer.
  if (cfg.requireVapid && !cfg.vapidConfigured) {
    throw new Error('FATAL: VAPID_SUBJECT, VAPID_PUBLIC_KEY, and VAPID_PRIVATE_KEY are required. Refusing to start.');
  }
};
