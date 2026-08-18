/**
 * update_account — Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI → API).
 */
import { updateAccountTool as generated } from "../generated/http-tools.js";

export const updateAccountTool = Object.assign(generated, { name: "update_account" });
