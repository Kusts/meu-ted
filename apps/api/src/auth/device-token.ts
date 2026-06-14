/**
 * Device token auth stub for V1.
 *
 * Spec REQ-3 / REQ-3A: the API shall derive exactly one household from the
 * device token and shall ignore client-supplied household IDs.
 *
 * V1 demo implementation: any non-empty token "dev-token" maps to the
 * demo household. A real implementation will validate against a
 * device_tokens table and bind to a household_id. The shape of the
 * `resolveHousehold` function is the only API surface the rest of the
 * app cares about, so swapping for a real validator is local.
 */

import { DEMO_HOUSEHOLD_ID } from '../read-models/demo-data.js';

export type DeviceContext = {
  deviceId: string;
  householdId: string;
};

export type DeviceTokenStore = Record<string, DeviceContext>;

export const DEVICE_TOKEN_HEADER = 'x-device-token';

export const defaultDeviceTokenStore = (): DeviceTokenStore => ({
  'dev-token-1': { deviceId: 'dev-device-1', householdId: DEMO_HOUSEHOLD_ID },
  'dev-token-2': { deviceId: 'dev-device-2', householdId: DEMO_HOUSEHOLD_ID },
});

export class AuthError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const resolveHouseholdFromToken = (
  token: string | undefined,
  store: DeviceTokenStore = defaultDeviceTokenStore(),
): DeviceContext => {
  if (!token || token.trim() === '') {
    throw new AuthError('missing device token', 401, 'auth.missing_token');
  }
  const ctx = store[token];
  if (!ctx) {
    throw new AuthError('invalid or revoked device token', 401, 'auth.invalid_token');
  }
  return ctx;
};
