import type { PriceAlert } from "./store.js";

export type PriceFetcher = (productName: string) => Promise<number>;

export type PriceAlertNotification = {
  alertId: string;
  householdId: string;
  productName: string;
  targetPriceCents: number;
  currentPriceCents: number;
  condition: PriceAlert["condition"];
  triggered: boolean;
  triggeredAt: string;
  message: string;
};

export const isAlertTriggered = (alert: PriceAlert, currentPriceCents: number): boolean => {
  if (alert.condition === "below") return currentPriceCents <= alert.targetPriceCents;
  return currentPriceCents >= alert.targetPriceCents;
};

export const createMockPriceFetcher = (priceMap: Record<string, number>): PriceFetcher => {
  return async (productName: string) => {
    const key = productName.trim().toLowerCase();
    const found = Object.entries(priceMap).find(([k]) => k.toLowerCase() === key);
    if (found) return found[1]!;
    // deterministic fallback: hash productName to price 100..10000
    let hash = 0;
    for (let i = 0; i < productName.length; i++) hash = (hash * 31 + productName.charCodeAt(i)) >>> 0;
    return 500 + (hash % 9500);
  };
};

export const checkPriceAlert = (
  alert: PriceAlert,
  currentPriceCents: number,
): PriceAlertNotification | null => {
  const triggered = isAlertTriggered(alert, currentPriceCents);
  if (!triggered) return null;
  const direction = alert.condition === "below" ? "abaixo de" : "acima de";
  return {
    alertId: alert.id,
    householdId: alert.householdId,
    productName: alert.productName,
    targetPriceCents: alert.targetPriceCents,
    currentPriceCents,
    condition: alert.condition,
    triggered: true,
    triggeredAt: new Date().toISOString(),
    message: `${alert.productName} está ${direction} R$ ${(alert.targetPriceCents / 100).toFixed(2)} — preço atual R$ ${(currentPriceCents / 100).toFixed(2)}`,
  };
};

export const checkPriceAlerts = async (
  alerts: PriceAlert[],
  fetcher: PriceFetcher,
): Promise<PriceAlertNotification[]> => {
  const notifications: PriceAlertNotification[] = [];
  for (const alert of alerts) {
    const current = await fetcher(alert.productName);
    const n = checkPriceAlert(alert, current);
    if (n) notifications.push(n);
  }
  return notifications;
};
