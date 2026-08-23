/**
 * confirm_pending_operation â€” Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { confirmPendingOperationTool as generated } from "../generated/http-tools.js";

export const confirmPendingOperationTool = Object.assign(generated, { name: "confirm_pending_operation" });