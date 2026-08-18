/**
 * update_category — Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI → API).
 */
import { updateCategoryTool as generated } from "../generated/http-tools.js";

export const updateCategoryTool = Object.assign(generated, { name: "update_category" });
