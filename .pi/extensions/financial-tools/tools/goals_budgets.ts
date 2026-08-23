/**
 * goals_budgets — Pi tools facade for goals and budgets
 * Delegates to generated authenticated HTTP adapters (OpenAPI → API).
 */
import {
  createGoalTool as generatedCreateGoal,
  listGoalsTool as generatedListGoals,
  contributeToGoalTool as generatedContributeGoal,
  cancelGoalTool as generatedCancelGoal,
  createBudgetTool as generatedCreateBudget,
  listBudgetsTool as generatedListBudgets,
  checkBudgetsTool as generatedCheckBudgets,
  budgetTrendsTool as generatedBudgetTrends,
  updateBudgetTool as generatedUpdateBudget,
} from "../generated/http-tools.js";
import { Type } from "typebox";
import { capabilityDisabled } from "./api-tool-helpers.js";

export const createGoal = Object.assign(generatedCreateGoal, { name: "create_goal" });
export const listGoals = Object.assign(generatedListGoals, { name: "list_goals" });
export const contributeToGoal = Object.assign(generatedContributeGoal, { name: "contribute_to_goal" });
export const cancelGoal = Object.assign(generatedCancelGoal, { name: "cancel_goal" });
export const createBudget = Object.assign(generatedCreateBudget, { name: "create_budget" });
export const listBudgets = Object.assign(generatedListBudgets, { name: "list_budgets" });
export const checkBudgets = Object.assign(generatedCheckBudgets, { name: "check_budgets" });
export const budgetTrendsTool = Object.assign(generatedBudgetTrends, { name: "budget_trends" });
export const updateBudgetTool = Object.assign(generatedUpdateBudget, { name: "update_budget" });

export const createGoalTool = createGoal;
export const listGoalsTool = listGoals;
export const contributeToGoalTool = contributeToGoal;
export const cancelGoalTool = cancelGoal;
export const createBudgetTool = createBudget;
export const listBudgetsTool = listBudgets;
export const checkBudgetsTool = checkBudgets;

export const refreshGoalsTool = {
  name: "refresh_goals",
  description: "Recompute achieved/failed goal status",
  parameters: Type.Object({}),
  execute: async () => capabilityDisabled("refresh_goals") ?? { success: false, reason: "refresh_goals route not implemented" },
};

export const suggestBudgetAdjustmentTool = {
  name: "suggest_budget_adjustment",
  description: "Suggest a budget from historical spend",
  parameters: Type.Object({}),
  execute: async () => capabilityDisabled("suggest_budget_adjustment") ?? { success: false, reason: "suggest_budget_adjustment route not implemented" },
};
