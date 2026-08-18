/**
 * refresh_payable_status — Pi tool facade
 * Delegates to generated authenticated HTTP adapter (OpenAPI → API).
 */
import { refreshPayableStatusTool as generated } from "../generated/http-tools.js";

export const refreshPayableStatusTool = Object.assign(generated, { name: "refresh_payable_status" });
export const refreshPayableStatus = refreshPayableStatusTool;
