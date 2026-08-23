import test from "node:test";
import assert from "node:assert/strict";
import { postDueRecurring } from "./tools/create_recurring_purchase.js";
import { refreshGoalsTool, suggestBudgetAdjustmentTool } from "./tools/goals_budgets.js";
import { deleteNotification, processNotifications, getNotificationLog, testNotification } from "./tools/notification_tools.js";
import { postDueRecurring as twinPostDueRecurring, listRecurringPurchases as twinListRecurringPurchases } from "./tools/recurring_status.js";

const tools = [
  postDueRecurring,
  refreshGoalsTool,
  suggestBudgetAdjustmentTool,
  deleteNotification,
  processNotifications,
  getNotificationLog,
  testNotification,
  twinPostDueRecurring,
  twinListRecurringPurchases,
];

test("every Pi tool exposes a JSON Schema object with type=object as parameters", () => {
  for (const tool of tools) {
    const parameters = tool.parameters as { type?: unknown; properties?: unknown } | undefined;
    assert.ok(parameters, `${tool.name}: parameters must be defined`);
    assert.equal(
      parameters.type,
      "object",
      `${tool.name}: parameters.type must be "object" so the provider accepts the tool schema (got ${String(parameters.type)})`,
    );
    assert.ok(
      parameters.properties && typeof parameters.properties === "object",
      `${tool.name}: parameters.properties must be an object`,
    );
  }
});
