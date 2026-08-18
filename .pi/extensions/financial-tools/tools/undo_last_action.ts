/**
 * undo_last_action — Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI → API).
 */
import { undoLastActionTool as generated } from "../generated/http-tools.js";

export const undoLastActionTool = Object.assign(generated, { name: "undo_last_action" });