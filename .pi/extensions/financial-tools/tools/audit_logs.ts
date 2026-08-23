/**
 * audit_logs â€” Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { auditLogsTool as generated } from "../generated/http-tools.js";

export const auditLogsTool = Object.assign(generated, { name: "audit_logs" });