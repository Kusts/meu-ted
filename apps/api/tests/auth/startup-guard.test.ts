import { describe, it, expect } from 'vitest';
import { validateStartupConfig } from '../../src/server/startup-guard.js';

describe('G0.1.4 — startup must crash without auth, DB, and schema', () => {
  it('throws when AUTH_SECRET is missing', () => {
    expect(() => validateStartupConfig({ authSecret: null, databaseUrl: 'postgres://localhost/test', schemaValid: true }))
      .toThrow(/AUTH_SECRET/);
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => validateStartupConfig({ authSecret: 'secret', databaseUrl: null, schemaValid: true }))
      .toThrow(/DATABASE_URL/);
  });

  it('throws when DATABASE_URL is empty string', () => {
    expect(() => validateStartupConfig({ authSecret: 'secret', databaseUrl: '', schemaValid: true }))
      .toThrow(/DATABASE_URL/);
  });

  it('allows startup without invite delivery because invite routes remain disabled', () => {
    expect(() => validateStartupConfig({ authSecret: 'secret', databaseUrl: 'postgres://localhost/test', schemaValid: true, inviteDeliveryConfigured: false }))
      .not.toThrow();
  });

  it('throws when schema is invalid', () => {
    expect(() => validateStartupConfig({ authSecret: 'secret', databaseUrl: 'postgres://localhost/test', schemaValid: false }))
      .toThrow(/schema/);
  });

  it('throws when production requires VAPID but the key pair is absent', () => {
    expect(() => validateStartupConfig({ authSecret: 'secret', databaseUrl: 'postgres://localhost/test', schemaValid: true, requireVapid: true, vapidConfigured: false }))
      .toThrow(/VAPID/);
  });

  it('does not throw when required VAPID configuration is valid', () => {
    expect(() => validateStartupConfig({ authSecret: 'secret', databaseUrl: 'postgres://localhost/test', schemaValid: true, requireVapid: true, vapidConfigured: true }))
      .not.toThrow();
  });

  it('does not throw when local in-memory mode does not configure VAPID', () => {
    expect(() => validateStartupConfig({ authSecret: 'secret', databaseUrl: 'postgres://localhost/test', schemaValid: true }))
      .not.toThrow();
  });
});
