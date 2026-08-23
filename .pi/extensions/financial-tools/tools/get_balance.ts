/**
 * get_balance â€” Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { getBalanceTool as generated } from "../generated/http-tools.js";

export const getBalanceTool = Object.assign(generated, { name: "get_balance" });
