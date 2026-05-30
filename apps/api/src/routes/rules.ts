// ─────────────────────────────────────────────────────────────────────────────
// Categorization Rules API Routes
// POST /categories/rules, GET /categories/rules, DELETE /categories/rules/:id
// ─────────────────────────────────────────────────────────────────────────────

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { CategorizationRule, CategorizationRuleCreate } from '@pi-financeiro/domain';

export interface RulesDeps {
  ruleRepository: {
    create(rule: CategorizationRule): Promise<CategorizationRule>;
    findById(id: string): Promise<CategorizationRule | null>;
    findActiveByHouseholdId(householdId: string): Promise<CategorizationRule[]>;
    delete(id: string): Promise<void>;
  };
}

export async function registerRulesRoutes(
  app: FastifyInstance,
  deps: RulesDeps
): Promise<void> {
  // ─────────────────────────────────────────────────────────────────────────
  // POST /categories/rules - Create rule
  // ─────────────────────────────────────────────────────────────────────────

  app.post('/categories/rules', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CategorizationRuleCreate;

    if (!body.householdId || !body.matcher || !body.categoryId) {
      return reply.status(400).send({
        success: false,
        reason: 'householdId, matcher, e categoryId são obrigatórios',
      });
    }

    const rule: CategorizationRule = {
      id: crypto.randomUUID(),
      householdId: body.householdId,
      matcher: body.matcher,
      matcherType: body.matcherType || 'text',
      categoryId: body.categoryId,
      priority: body.priority || 0,
      active: true,
      createdAt: new Date().toISOString(),
    };

    const created = await deps.ruleRepository.create(rule);

    return reply.status(201).send({
      success: true,
      rule: created,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /categories/rules?householdId= - List rules
  // ─────────────────────────────────────────────────────────────────────────

  app.get('/categories/rules', async (request: FastifyRequest, reply: FastifyReply) => {
    const { householdId } = request.query as { householdId?: string };

    if (!householdId) {
      return reply.status(400).send({
        success: false,
        reason: 'householdId é obrigatório',
      });
    }

    const rules = await deps.ruleRepository.findActiveByHouseholdId(householdId);

    return reply.status(200).send({
      success: true,
      rules,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /categories/rules/:id - Delete rule
  // ─────────────────────────────────────────────────────────────────────────

  app.delete('/categories/rules/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const existing = await deps.ruleRepository.findById(id);
    if (!existing) {
      return reply.status(404).send({
        success: false,
        reason: 'Regra não encontrada',
      });
    }

    await deps.ruleRepository.delete(id);

    return reply.status(200).send({
      success: true,
    });
  });
}