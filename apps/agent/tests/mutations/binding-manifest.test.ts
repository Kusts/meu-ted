import { describe, expect, it } from 'vitest';
import { createV2BindingManifest } from '../../src/mutations/binding-manifest.js';

describe('V2 binding manifest', () => {
  const input = {
    workspaceId: 'workspace-1',
    actorId: 'actor-1',
    deviceId: 'device-1',
    proposalHash: 'hash-1',
    pendingOperationId: 'pending-1',
    idempotencyKey: 'idem-1',
  };

  it('rejects incomplete bindings', () => {
    expect(() => createV2BindingManifest({ ...input, deviceId: '' })).toThrow(/deviceId/);
  });

  it('returns an immutable manifest with all required bindings', () => {
    const manifest = createV2BindingManifest(input);
    expect(manifest).toEqual(input);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(() => ((manifest as { actorId: string }).actorId = 'other')).toThrow();
  });
});
