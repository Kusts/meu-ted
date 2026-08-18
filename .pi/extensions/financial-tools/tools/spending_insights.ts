/**
 * spending_insights — Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI → API).
 */
import { spendingInsightsTool as generated } from "../generated/http-tools.js";

export const spendingInsights = Object.assign(generated, { name: "spending_insights" });

