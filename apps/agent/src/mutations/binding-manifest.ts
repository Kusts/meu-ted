/** Immutable context binding required by every future V2 mutation executor. */
export type V2BindingManifest = Readonly<{
  workspaceId: string;
  actorId: string;
  deviceId: string;
  proposalHash: string;
  pendingOperationId: string;
  idempotencyKey: string;
}>;

const REQUIRED_BINDINGS = [
  'workspaceId',
  'actorId',
  'deviceId',
  'proposalHash',
  'pendingOperationId',
  'idempotencyKey',
] as const;

export const createV2BindingManifest = (input: {
  workspaceId: string;
  actorId: string;
  deviceId: string;
  proposalHash: string;
  pendingOperationId: string;
  idempotencyKey: string;
}): V2BindingManifest => {
  for (const field of REQUIRED_BINDINGS) {
    if (typeof input[field] !== 'string' || input[field].trim() === '') {
      throw new Error(`binding ${field} is required`);
    }
  }

  return Object.freeze({
    workspaceId: input.workspaceId.trim(),
    actorId: input.actorId.trim(),
    deviceId: input.deviceId.trim(),
    proposalHash: input.proposalHash.trim(),
    pendingOperationId: input.pendingOperationId.trim(),
    idempotencyKey: input.idempotencyKey.trim(),
  });
};
