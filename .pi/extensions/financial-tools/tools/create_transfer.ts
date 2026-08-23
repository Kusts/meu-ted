/**
 * create_transfer â€” Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { createTransferTool as generated } from "../generated/http-tools.js";

export const createTransferTool = Object.assign(generated, { name: "create_transfer" });
