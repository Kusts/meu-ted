/**
 * create_income — Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI → API).
 */
import { createIncomeTool as generated } from "../generated/http-tools.js";

export const createIncomeTool = Object.assign(generated, { name: "create_income" });
