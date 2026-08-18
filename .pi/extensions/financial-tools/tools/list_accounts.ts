/**
 * list_accounts — Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI → API).
 */
import { listAccountsTool as generated } from "../generated/http-tools.js";

export const listAccountsTool = Object.assign(generated, { name: "list_accounts" });
