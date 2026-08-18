/**
 * create_category — Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI → API).
 */
import { createCategoryTool as generated } from "../generated/http-tools.js";

export const createCategoryTool = Object.assign(generated, { name: "create_category" });
