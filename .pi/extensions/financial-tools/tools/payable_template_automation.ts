/**
 * payable_template_automation â€” Pi tool facade
 * Delegates to generated authenticated HTTP adapter (OpenAPI â†’ API).
 */
import { autoCreateFromTemplatesTool as generated } from "../generated/http-tools.js";

export const autoCreateFromTemplatesTool = Object.assign(generated, { name: "auto_create_from_templates" });
export const autoCreateFromTemplates = autoCreateFromTemplatesTool;
