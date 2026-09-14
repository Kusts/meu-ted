import type { PlannedOperation, TurnPlan } from './conversation-orchestrator.js';

export type TurnPlanV2 = TurnPlan & Readonly<{
  requestedTools?: readonly string[];
  correctionCount?: number;
}>;

export type ValidatedTurnPlan = Readonly<{
  success: true;
  plan: TurnPlanV2;
  clarification?: undefined;
}> | Readonly<{
  success: false;
  clarification: string;
  plan?: undefined;
}>;

export const INVALID_PLAN_CLARIFICATION = 'Não consegui entender o pedido com segurança. Pode esclarecer?';

const validModes = new Set(['read', 'mutation-proposal', 'confirmation', 'cancel', 'advice', 'conversation', 'unsupported']);
const validDomains = new Set(['accounts', 'transactions', 'cards', 'payables', 'budgets', 'goals', 'categories', 'memory', 'web', 'general']);
const isOperation = (value: unknown): value is PlannedOperation => {
  if (!value || typeof value !== 'object') return false;
  const operation = value as Record<string, unknown>;
  return typeof operation.name === 'string' && operation.name.trim().length > 0 && (operation.kind === 'read' || operation.kind === 'mutation');
};

export const validateTurnPlan = (candidate: unknown): ValidatedTurnPlan => {
  if (!candidate || typeof candidate !== 'object') return { success: false, clarification: INVALID_PLAN_CLARIFICATION };
  const plan = candidate as Record<string, unknown>;
  const operations = plan.requestedOperations;
  const skills = plan.skillNames;
  const tools = plan.requestedTools;
  const correctionCount = plan.correctionCount ?? 0;
  if (plan.version !== '2' || typeof plan.mode !== 'string' || !validModes.has(plan.mode) || typeof plan.domain !== 'string' || !validDomains.has(plan.domain)) return { success: false, clarification: INVALID_PLAN_CLARIFICATION };
  if (!Array.isArray(skills) || skills.length > 2 || skills.some((skill) => typeof skill !== 'string' || !skill.trim())) return { success: false, clarification: INVALID_PLAN_CLARIFICATION };
  if (!Array.isArray(operations) || operations.length > 4 || operations.some((operation) => !isOperation(operation))) return { success: false, clarification: INVALID_PLAN_CLARIFICATION };
  if (tools !== undefined && (!Array.isArray(tools) || tools.length > 8 || tools.some((tool) => typeof tool !== 'string' || !tool.trim()))) return { success: false, clarification: INVALID_PLAN_CLARIFICATION };
  if (typeof correctionCount !== 'number' || !Number.isInteger(correctionCount) || correctionCount < 0 || correctionCount > 1) return { success: false, clarification: INVALID_PLAN_CLARIFICATION };
  if (plan.mode === 'read' && (operations as PlannedOperation[]).some((operation) => operation.kind === 'mutation')) return { success: false, clarification: INVALID_PLAN_CLARIFICATION };
  if (typeof plan.confidence !== 'number' || !Number.isFinite(plan.confidence) || plan.confidence < 0 || plan.confidence > 1) return { success: false, clarification: INVALID_PLAN_CLARIFICATION };
  return { success: true, plan: Object.freeze({ ...candidate as TurnPlanV2, skillNames: Object.freeze([...skills as string[]]), requestedOperations: Object.freeze([...(operations as PlannedOperation[])]), ...(Array.isArray(tools) ? { requestedTools: Object.freeze([...tools as string[]]) } : {}) }) };
};

export const parseTurnPlan = (candidate: unknown): TurnPlanV2 => {
  const result = validateTurnPlan(candidate);
  if (!result.success) throw new Error('agent.invalid_turn_plan');
  return result.plan;
};
