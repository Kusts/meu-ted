import { randomUUID } from "node:crypto";

export type PriceAlertCondition = "below" | "above";

export type PriceAlert = {
  id: string;
  householdId: string;
  productName: string;
  targetPriceCents: number;
  condition: PriceAlertCondition;
  createdAt: string;
};

export type CreatePriceAlertInput = {
  productName: string;
  targetPriceCents: number;
  condition: PriceAlertCondition;
};

export type PriceAlertStore = {
  createAlert(householdId: string, input: CreatePriceAlertInput): Promise<PriceAlert>;
  listAlerts(householdId: string): Promise<PriceAlert[]>;
  getAlert(householdId: string, id: string): Promise<PriceAlert | null>;
  clear(householdId?: string): Promise<void>;
};

export const createInMemoryPriceAlertStore = (): PriceAlertStore => {
  const alerts: PriceAlert[] = [];

  return {
    async createAlert(householdId, input) {
      const alert: PriceAlert = {
        id: randomUUID(),
        householdId,
        productName: input.productName.trim(),
        targetPriceCents: input.targetPriceCents,
        condition: input.condition,
        createdAt: new Date().toISOString(),
      };
      alerts.push(alert);
      return alert;
    },
    async listAlerts(householdId) {
      return alerts
        .filter((a) => a.householdId === householdId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async getAlert(householdId, id) {
      return alerts.find((a) => a.id === id && a.householdId === householdId) ?? null;
    },
    async clear(householdId) {
      if (householdId) {
        for (let i = alerts.length - 1; i >= 0; i--) {
          if (alerts[i]!.householdId === householdId) alerts.splice(i, 1);
        }
      } else {
        alerts.length = 0;
      }
    },
  };
};
