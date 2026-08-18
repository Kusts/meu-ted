/**
 * create_account — Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI → API).
 */
import { createAccountTool as generated } from "../generated/http-tools.js";

export const createAccountTool = Object.assign(generated, { name: "create_account" });
