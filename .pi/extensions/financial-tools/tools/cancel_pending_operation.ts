/**
 * cancel_pending_operation — Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI → API).
 */
import { cancelPendingOperationTool as generated } from "../generated/http-tools.js";

export const cancelPendingOperationTool = Object.assign(generated, { name: "cancel_pending_operation" });