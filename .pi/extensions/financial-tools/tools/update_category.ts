/**
 * update_category â€” Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { updateCategoryTool as generated } from "../generated/http-tools.js";

export const updateCategoryTool = Object.assign(generated, { name: "update_category" });
