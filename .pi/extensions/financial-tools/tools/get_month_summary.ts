/**
 * get_month_summary â€” Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { getMonthSummaryTool as generated } from "../generated/http-tools.js";

export const getMonthSummaryTool = Object.assign(generated, { name: "get_month_summary" });
