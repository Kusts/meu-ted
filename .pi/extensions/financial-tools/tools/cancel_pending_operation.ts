/**
 * cancel_pending_operation â€” Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { cancelPendingOperationTool as generated } from "../generated/http-tools.js";

export const cancelPendingOperationTool = Object.assign(generated, { name: "cancel_pending_operation" });