/**
 * undo_last_action â€” Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { undoLastActionTool as generated } from "../generated/http-tools.js";

export const undoLastActionTool = Object.assign(generated, { name: "undo_last_action" });