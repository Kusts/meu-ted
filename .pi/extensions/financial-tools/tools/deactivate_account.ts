/**
 * deactivate_account — Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI → API).
 */
import { deactivateAccountTool as generated } from "../generated/http-tools.js";

export const deactivateAccountTool = Object.assign(generated, { name: "deactivate_account" });
