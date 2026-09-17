import { AuthError, type DeviceTokenStore } from './device-token.js';
import type { WorkspaceAccess, WorkspaceAccessStore } from './workspace-access.js';
import type { WorkspaceStore } from './workspaces-store.js';

export type AuthorizedDevice = {
  deviceId: string;
  userId: string;
  workspaceId: string;
  access: WorkspaceAccess;
};

export type AuthorizedDeviceDeps = {
  tokenStore: Pick<DeviceTokenStore, 'resolve'>;
  workspaceAccess: WorkspaceAccessStore;
  workspaceStore?: Pick<WorkspaceStore, 'list'>;
};

const forbidden = (): AuthError =>
  new AuthError('Acesso ao workspace proibido.', 403, 'auth.workspace_forbidden');

export const resolveAuthorizedDevice = async (
  deps: AuthorizedDeviceDeps,
  token: string | undefined,
  workspaceId: string,
): Promise<AuthorizedDevice> => {
  const device = await deps.tokenStore.resolve(token);
  if (device.householdId !== workspaceId) throw forbidden();
  const userId = device.userId ?? null;
  if (!userId) throw forbidden();
  const access = await deps.workspaceAccess.resolve(userId, workspaceId);
  if (!access) throw forbidden();
  if (deps.workspaceStore) {
    const items = await deps.workspaceStore.list(userId);
    const workspace = items.find((item) => item.id === workspaceId);
    if (workspace && workspace.status !== 'active') throw forbidden();
  }
  return { deviceId: device.deviceId, userId, workspaceId: access.householdId, access };
};
