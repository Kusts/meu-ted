/**
 * get_statement_details â€” Pi tool facade
 * Delegates to generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { getStatementDetailsTool as generated } from "../generated/http-tools.js";

export const getStatementDetailsTool = Object.assign(generated, { name: "get_statement_details" });
export const getStatementDetails = getStatementDetailsTool;
