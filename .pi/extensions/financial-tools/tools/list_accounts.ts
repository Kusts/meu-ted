/**
 * list_accounts â€” Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { listAccountsTool as generated } from "../generated/http-tools.js";

export const listAccountsTool = Object.assign(generated, { name: "list_accounts" });
