/**
 * create_card_purchase — Pi tool facade
 * Delegates to generated authenticated HTTP adapter (OpenAPI → API).
 */
import { createCardPurchaseTool as generated } from "../generated/http-tools.js";

export const createCardPurchaseTool = Object.assign(generated, { name: "create_card_purchase" });
export const createCardPurchase = createCardPurchaseTool;
