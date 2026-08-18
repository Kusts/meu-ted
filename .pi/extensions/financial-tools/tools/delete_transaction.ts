/**
 * delete_transaction — Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI → API).
 */
import { deleteTransactionTool as generated } from "../generated/http-tools.js";

export const deleteTransactionTool = Object.assign(generated, { name: "delete_transaction" });
