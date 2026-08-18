/**
 * create_recurring_purchase — Pi tools facade for recurring purchases
 * Delegates to generated authenticated HTTP adapters (OpenAPI → API).
 */
import {
  createRecurringPurchaseTool as generatedCreate,
  listRecurringPurchasesTool as generatedList,
} from "../generated/http-tools.js";
import { capabilityDisabled } from "./api-tool-helpers.js";

export const createRecurringPurchase = Object.assign(generatedCreate, { name: "create_recurring_purchase" });
export const listRecurringPurchases = Object.assign(generatedList, { name: "list_recurring_purchases" });

export const createRecurringPurchaseTool = createRecurringPurchase;
export const listRecurringPurchasesTool = listRecurringPurchases;

export const postDueRecurring = {
  name: "post_due_recurring",
  description: "Post recurring purchases due today",
  parameters: {},
  execute: async () => capabilityDisabled("post_due_recurring") ?? { success: false, reason: "post_due_recurring route not implemented" },
};
