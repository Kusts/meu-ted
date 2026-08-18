/**
 * list_statements — Pi tool facade
 * Delegates to generated authenticated HTTP adapter (OpenAPI → API).
 */
import { listStatementsTool as generated } from "../generated/http-tools.js";

export const listStatementsTool = Object.assign(generated, { name: "list_statements" });
export const listStatements = listStatementsTool;
