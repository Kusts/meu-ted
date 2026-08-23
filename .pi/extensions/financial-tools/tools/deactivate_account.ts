/**
 * deactivate_account â€” Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { deactivateAccountTool as generated } from "../generated/http-tools.js";

export const deactivateAccountTool = Object.assign(generated, { name: "deactivate_account" });
