// ─────────────────────────────────────────────────────────────────────────────
// Review Queue API Routes
// GET /review, POST /review/:id/approve, POST /review/:id/reject
// ─────────────────────────────────────────────────────────────────────────────

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export interface ReviewDeps {
  reviewService: {
    submitForReview(input: {
      householdId: string;
      recordId?: string;
      reason: 'high_value' | 'duplicate' | 'account_not_found' | 'category_conflict' | 'manual_review';
      payload: Record<string, unknown>;
    }): Promise<{ success: boolean; entry?: unknown; reason?: string }>;
    approve(entryId: string, userId: string): Promise<{ success: boolean; entry?: unknown; reason?: string }>;
    reject(entryId: string, userId: string, cancelRecord?: boolean): Promise<{ success: boolean; entry?: unknown; reason?: string }>;
    listPending(householdId: string): Promise<unknown[]>;
    listAll(householdId: string): Promise<unknown[]>;
    pendingCount(householdId: string): Promise<number>;
  };
}

export async function registerReviewRoutes(
  app: FastifyInstance,
  deps: ReviewDeps
): Promise<void> {
  // ─────────────────────────────────────────────────────────────────────────
  // GET /review - List pending reviews
  // ─────────────────────────────────────────────────────────────────────────

  app.get('/review', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { householdId?: string; status?: string };
    
    if (!query.householdId) {
      return reply.status(400).send({
        success: false,
        reason: 'householdId é obrigatório',
      });
    }

    const entries = query.status === 'all'
      ? await deps.reviewService.listAll(query.householdId)
      : await deps.reviewService.listPending(query.householdId);

    const count = await deps.reviewService.pendingCount(query.householdId);

    return reply.send({
      success: true,
      entries,
      pendingCount: count,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /review/:id - Get single review entry
  // ─────────────────────────────────────────────────────────────────────────

  app.get('/review/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;

    const entries = await deps.reviewService.listAll(id);
    const entry = entries.find((e: any) => e.id === id);

    if (!entry) {
      return reply.status(404).send({
        success: false,
        reason: 'Entry not found',
      });
    }

    return reply.send({
      success: true,
      entry,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /review/:id/approve - Approve review entry
  // ─────────────────────────────────────────────────────────────────────────

  app.post('/review/:id/approve', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const body = request.body as { userId?: string };

    if (!body.userId) {
      return reply.status(400).send({
        success: false,
        reason: 'userId é obrigatório',
      });
    }

    const result = await deps.reviewService.approve(id, body.userId);

    if (!result.success) {
      return reply.status(400).send(result);
    }

    return reply.send(result);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /review/:id/reject - Reject review entry
  // ─────────────────────────────────────────────────────────────────────────

  app.post('/review/:id/reject', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const body = request.body as { userId?: string; cancelRecord?: boolean };

    if (!body.userId) {
      return reply.status(400).send({
        success: false,
        reason: 'userId é obrigatório',
      });
    }

    const result = await deps.reviewService.reject(id, body.userId, body.cancelRecord);

    if (!result.success) {
      return reply.status(400).send(result);
    }

    return reply.send(result);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /review/count - Get pending count (for badge)
  // ─────────────────────────────────────────────────────────────────────────

  app.get('/review/count', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { householdId?: string };
    
    if (!query.householdId) {
      return reply.status(400).send({
        success: false,
        reason: 'householdId é obrigatório',
      });
    }

    const count = await deps.reviewService.pendingCount(query.householdId);

    return reply.send({
      success: true,
      count,
    });
  });
}
