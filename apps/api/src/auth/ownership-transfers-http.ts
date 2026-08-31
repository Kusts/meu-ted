import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { OwnershipTransferStore } from './ownership-transfers-postgres.js';
import { requireWorkspaceRole } from './workspace-access.js';

const params = z.object({ householdId: z.string().uuid(), transferId: z.string().uuid().optional() });
const createBody = z.object({ toUserId: z.string().trim().min(1).max(200) });

export const registerOwnershipTransferRoutes = (app: FastifyInstance, store: OwnershipTransferStore): void => {
  app.get('/workspaces/:householdId/ownership-transfers', async (request, reply) => {
    if (!request.authenticatedContext || !request.authenticatedContext.authUserId) {
      return reply.code(401).send({ code: 'auth.session_required', message: 'human session required' });
    }
    const context = request.authenticatedContext;
    const parsedParams = params.safeParse(request.params);
    if (!parsedParams.success) return reply.code(400).send({ code: 'validation.error' });
    if (parsedParams.data.householdId !== context.householdId) {
      return reply.code(403).send({ code: 'auth.forbidden', message: 'household mismatch' });
    }
    try {
      requireWorkspaceRole(request, ['owner', 'member']);
      const items = await store.listPending({
        householdId: context.householdId,
        authUserId: context.authUserId!,
      });
      if (context.role !== 'owner' && items.length === 0) {
        return reply.code(403).send({ code: 'auth.ownership_transfer_forbidden', message: 'not authorized to view ownership transfers' });
      }
      return reply.code(200).send({ items, total: items.length });
    } catch (error) {
      return sendTransferError(reply, error);
    }
  });

  app.post('/workspaces/:householdId/ownership-transfers', async (request, reply) => {
    if (!request.authenticatedContext || !request.authenticatedContext.authUserId) {
      return reply.code(401).send({ code: 'auth.session_required', message: 'human session required' });
    }
    const context = request.authenticatedContext;
    const parsedParams = params.safeParse(request.params);
    const parsedBody = createBody.safeParse(request.body ?? {});
    if (!parsedParams.success || !parsedBody.success) return reply.code(400).send({ code: 'validation.error' });
    if (parsedParams.data.householdId !== context.householdId) {
      return reply.code(403).send({ code: 'auth.forbidden', message: 'household mismatch' });
    }
    try {
      requireWorkspaceRole(request, ['owner']);
      const transfer = await store.create({
        householdId: context.householdId,
        fromAuthUserId: context.authUserId!,
        toAuthUserId: parsedBody.data.toUserId,
      });
      return reply.code(201).send(transfer);
    } catch (error) {
      return sendTransferError(reply, error);
    }
  });

  app.post('/workspaces/:householdId/ownership-transfers/:transferId/accept', async (request, reply) => {
    if (!request.authenticatedContext || !request.authenticatedContext.authUserId) {
      return reply.code(401).send({ code: 'auth.session_required', message: 'human session required' });
    }
    const context = request.authenticatedContext;
    const parsed = params.safeParse(request.params);
    if (!parsed.success || !parsed.data.transferId) return reply.code(400).send({ code: 'validation.error' });
    if (parsed.data.householdId !== context.householdId) {
      return reply.code(403).send({ code: 'auth.forbidden', message: 'household mismatch' });
    }
    try {
      requireWorkspaceRole(request, ['owner', 'member']);
      const transfer = await store.accept({
        householdId: context.householdId,
        transferId: parsed.data.transferId,
        destinationAuthUserId: context.authUserId!,
      });
      return reply.code(200).send(transfer);
    } catch (error) {
      return sendTransferError(reply, error);
    }
  });
};

const sendTransferError = (reply: { code: (status: number) => { send: (body: unknown) => unknown } }, error: unknown): unknown => {
  const typed = error as { statusCode?: number; code?: string; message?: string };
  return reply.code(typed.statusCode ?? 500).send({ code: typed.code ?? 'ownership_transfer.error', message: typed.message ?? 'ownership transfer failed' });
};
