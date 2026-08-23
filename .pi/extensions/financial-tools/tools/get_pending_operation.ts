/**
 * get_pending_operation â€” Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { getPendingOperationTool as generated } from "../generated/http-tools.js";

export const getPendingOperationTool = Object.assign(generated, { name: "get_pending_operation" });