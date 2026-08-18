import { Type } from "typebox";
import { capabilityDisabled } from "./api-tool-helpers.js";
export const refreshGoalsTool = { name: "refresh_goals", description: "Atualiza status das metas.", parameters: Type.Object({ householdId: Type.Optional(Type.String()) }), execute: async () => capabilityDisabled("refresh_goals") ?? { success: false, reason: "Capability refresh_goals has no API route yet" } };
export const suggestBudgetAdjustmentTool = { name: "suggest_budget_adjustment", description: "Sugere ajuste de orçamento.", parameters: Type.Object({ householdId: Type.Optional(Type.String()), budgetId: Type.String() }), execute: async () => capabilityDisabled("suggest_budget_adjustment") ?? { success: false, reason: "Capability suggest_budget_adjustment has no API route yet" } };
