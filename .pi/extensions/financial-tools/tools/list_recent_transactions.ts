/**
 * list_recent_transactions â€” Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { listRecentTransactionsTool as generated } from "../generated/http-tools.js";

export const listRecentTransactionsTool = Object.assign(generated, { name: "list_recent_transactions" });
