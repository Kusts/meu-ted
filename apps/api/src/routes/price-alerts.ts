import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { DEVICE_TOKEN_HEADER } from "../auth/device-token.js";
import type { PriceAlertStore } from "../price-alerts/store.js";
import { checkPriceAlert } from "../price-alerts/checker.js";
import type { AuthResolver } from "./auth.js";

const createPriceAlertSchema = z.object({
  productName: z.string().trim().min(1, "productName obrigatório").max(200),
  targetPriceCents: z.number().int().positive("targetPriceCents deve ser positivo"),
  condition: z.enum(["below", "above"]),
});

const resolveAuth = (resolveToken: AuthResolver) => async (req: FastifyRequest) => {
  if (req.authenticatedContext) return req.authenticatedContext;
  const token = req.headers[DEVICE_TOKEN_HEADER];
  return resolveToken(Array.isArray(token) ? token[0] : token);
};

const handleError = (err: unknown, reply: FastifyReply) => {
  if ((err as { statusCode?: number })?.statusCode) {
    const e = err as { statusCode: number; code?: string; message?: string };
    return reply.code(e.statusCode).send({ code: e.code ?? "auth.error", message: e.message ?? "unauthorized" });
  }
  throw err;
};

export const registerPriceAlertRoutes = (
  app: FastifyInstance,
  opts: {
    priceAlertStore: PriceAlertStore;
    resolveToken: AuthResolver;
  },
): void => {
  const resolve = resolveAuth(opts.resolveToken);

  app.get("/alerts/price", async (req, reply) => {
    let ctx;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const items = await opts.priceAlertStore.listAlerts(ctx.householdId);
    return reply.code(200).send({ items, total: items.length });
  });

  app.post("/alerts/price", async (req, reply) => {
    let ctx;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const parsed = createPriceAlertSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ code: "validation.error", issues: parsed.error.issues });
    }
    const alert = await opts.priceAlertStore.createAlert(ctx.householdId, parsed.data);
    return reply.code(201).send(alert);
  });

  // Checker endpoint: verifica alertas do household com preço atual mockado.
  // Query/body opcional: productName + currentPriceCents para teste manual.
  app.post("/alerts/price/check", async (req, reply) => {
    let ctx;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const schema = z.object({
      currentPriceCents: z.number().int().positive().optional(),
      productName: z.string().trim().min(1).optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ code: "validation.error", issues: parsed.error.issues });
    }
    const alerts = await opts.priceAlertStore.listAlerts(ctx.householdId);
    // Se currentPriceCents fornecido, usa para avaliar; senão gera mock determinístico por produto
    const notifications = alerts
      .map((alert) => {
        const price = parsed.data.currentPriceCents ?? (() => {
          // mock simples baseado no nome (hash) se não fornecido
          let h = 0;
          for (let i = 0; i < alert.productName.length; i++) h = (h * 31 + alert.productName.charCodeAt(i)) >>> 0;
          return 500 + (h % 9500);
        })();
        // se productName filtro fornecido, ignora outros
        if (parsed.data.productName && parsed.data.productName.trim().toLowerCase() !== alert.productName.toLowerCase()) {
          return null;
        }
        // se productName filtro e preço fornecido, usa preço fornecido apenas para esse produto
        const current = parsed.data.productName ? (parsed.data.currentPriceCents ?? price) : price;
        return checkPriceAlert(alert, current);
      })
      .filter(Boolean) as ReturnType<typeof checkPriceAlert>[];

    return reply.code(200).send({ notifications, total: notifications.length });
  });
};
