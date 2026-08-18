/**
 * create_card_installments — Pi tool facade
 * Delegates to generated authenticated HTTP adapter (OpenAPI → API).
 */
import { createCardInstallmentsTool as generated } from "../generated/http-tools.js";

export const createCardInstallmentsTool = Object.assign(generated, { name: "create_card_installments" });
export const createCardInstallments = createCardInstallmentsTool;
