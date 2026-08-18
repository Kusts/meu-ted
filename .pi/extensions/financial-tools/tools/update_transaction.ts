/**
 * update_transaction — Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI → API).
 */
import { updateTransactionTool as generated } from "../generated/http-tools.js";

export const updateTransactionTool = Object.assign(generated, { name: "update_transaction" });
