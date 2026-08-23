/**
 * list_categories â€” Pi tool facade
 * Delegates to the generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { listCategoriesTool as generated } from "../generated/http-tools.js";

export const listCategoriesTool = Object.assign(generated, { name: "list_categories" });
