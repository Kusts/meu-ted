import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';

describe('GET /profile', () => {
  it('returns null profile for unknown household on first read', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ profile: null });
  });

  it('requires auth', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/profile' });
    expect(res.statusCode).toBe(401);
  });

  it('scopes profile by household (one per household)', async () => {
    const { app } = buildTestApp();
    // PATCH on TOKEN_A household A
    await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'Marina' },
    });
    // GET on TOKEN_B household B must not see it
    const bRes = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_B },
    });
    expect(bRes.json()).toEqual({ profile: null });
  });
});

describe('PATCH /profile', () => {
  it('creates a profile on first PATCH and reflects the values in GET', async () => {
    const { app } = buildTestApp();
    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: {
        name: 'Marina Silva',
        email: 'marina@email.com',
        phone: '(11) 99999-9999',
        avatarColor: '#0E8C5A',
        greetingStyle: 'auto',
      },
    });
    expect(patchRes.statusCode).toBe(200);
    const profile = patchRes.json().profile;
    expect(profile.name).toBe('Marina Silva');
    expect(profile.email).toBe('marina@email.com');
    expect(profile.phone).toBe('(11) 99999-9999');
    expect(profile.avatarColor).toBe('#0E8C5A');
    expect(profile.greetingStyle).toBe('auto');

    const getRes = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(getRes.json().profile).toEqual(profile);
  });

  it('upserts partial fields without clobbering existing ones', async () => {
    const { app } = buildTestApp();
    // First PATCH: name only
    await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'Marina' },
    });
    // Second PATCH: contact + avatar only
    const patch2 = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: {
        email: 'marina@nova.com',
        phone: '(11) 98888-7777',
        avatarColor: '#820AD1',
      },
    });
    const profile = patch2.json().profile;
    expect(profile.name).toBe('Marina');
    expect(profile.email).toBe('marina@nova.com');
    expect(profile.phone).toBe('(11) 98888-7777');
    expect(profile.avatarColor).toBe('#820AD1');
  });

  it('rejects invalid email', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid avatarColor (not #RRGGBB)', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { avatarColor: 'red' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid greetingStyle enum', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { greetingStyle: 'shout' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects empty name', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires auth', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(401);
  });
});
