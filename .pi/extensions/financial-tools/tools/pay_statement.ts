/**
 * pay_statement â€” Pi tool facade
 * Delegates to generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { payStatementTool as generated } from "../generated/http-tools.js";

export const payStatementTool = Object.assign(generated, { name: "pay_statement" });
export const payStatement = payStatementTool;
