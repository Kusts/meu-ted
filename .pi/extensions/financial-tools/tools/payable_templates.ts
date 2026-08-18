/**
 * payable_templates — Pi tools facade for payable templates
 * Delegates to generated authenticated HTTP adapters (OpenAPI → API).
 */
import {
  createPayableTemplateTool as generatedCreate,
  createPayableFromTemplateTool as generatedFromTemplate,
  listPayableTemplatesTool as generatedList,
  autoCreateFromTemplatesTool as generatedAutoCreate,
} from "../generated/http-tools.js";

export const createPayableTemplate = Object.assign(generatedCreate, { name: "create_payable_template" });
export const createPayableFromTemplate = Object.assign(generatedFromTemplate, { name: "create_payable_from_template" });
export const listPayableTemplates = Object.assign(generatedList, { name: "list_payable_templates" });
export const autoCreateFromTemplates = Object.assign(generatedAutoCreate, { name: "auto_create_from_templates" });

export const createPayableTemplateTool = createPayableTemplate;
export const createPayableFromTemplateTool = createPayableFromTemplate;
export const listPayableTemplatesTool = listPayableTemplates;
export const autoCreateFromTemplatesTool = autoCreateFromTemplates;
