/**
 * create_expense — Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI → API).
 */
import { createExpenseTool as generated } from "../generated/http-tools.js";

export const createExpenseTool = Object.assign(generated, { name: "create_expense" });
