/**
 * create_credit_card_account — Pi tool facade
 * Delegates to generated authenticated HTTP adapter (OpenAPI → API).
 */
import { createCreditCardAccountTool as generated } from "../generated/http-tools.js";

export const createCreditCardAccountTool = Object.assign(generated, { name: "create_credit_card_account" });
export const createCreditCardAccount = createCreditCardAccountTool;
