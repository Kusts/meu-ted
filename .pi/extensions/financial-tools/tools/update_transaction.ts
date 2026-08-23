/**
 * update_transaction â€” Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { updateTransactionTool as generated } from "../generated/http-tools.js";

export const updateTransactionTool = Object.assign(generated, { name: "update_transaction" });
