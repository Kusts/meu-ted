/**
 * deactivate_category — Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI → API).
 */
import { deactivateCategoryTool as generated } from "../generated/http-tools.js";

export const deactivateCategoryTool = Object.assign(generated, { name: "deactivate_category" });
