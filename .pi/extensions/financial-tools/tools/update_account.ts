/**
 * update_account â€” Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { updateAccountTool as generated } from "../generated/http-tools.js";

export const updateAccountTool = Object.assign(generated, { name: "update_account" });
