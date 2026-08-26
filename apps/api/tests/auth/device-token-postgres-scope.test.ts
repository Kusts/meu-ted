import { describe, expect, it, vi } from 'vitest';
import { createPostgresDeviceTokenStore } from '../../src/auth/device-token.js';

const HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN_SECRET = '22222222-2222-4222-8222-222222222222';
const TOKEN = `${HOUSEHOLD_ID}.${TOKEN_SECRET}`;

describe('postgres device token workspace scope', () => {
  it('derives household context from the token before the scoped lookup', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ device_id: 'device-1', household_id: HOUSEHOLD_ID }] });
    const store = createPostgresDeviceTokenStore({ query } as never);

    await expect(store.resolve(TOKEN)).resolves.toEqual({
      deviceId: 'device-1',
      householdId: HOUSEHOLD_ID,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('household_id = $2'),
      [TOKEN, HOUSEHOLD_ID],
    );
  });

  it('creates tokens with an embedded household context', async () => {
    const query = vi.fn().mockResolvedValue({});
    const store = createPostgresDeviceTokenStore({ query } as never);

    const created = await store.register('device-1', HOUSEHOLD_ID);

    expect(created.token).toMatch(new RegExp(`^${HOUSEHOLD_ID}\\.`));
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO device_tokens'),
      [created.token, created.deviceId, HOUSEHOLD_ID],
    );
  });
});
