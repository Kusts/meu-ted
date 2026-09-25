/**
 * Temporary local Wrangler entrypoint for the authenticated E2E stack.
 * The production entrypoint also exports pure test helpers, which workerd
 * rejects as named Worker exports. This shim exposes only the Worker handler
 * and Durable Object class; do not use it for deployment.
 */
export { default, FinanceChatAgent } from "./worker.js";
