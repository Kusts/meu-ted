import { describe, it, expect } from "vitest";
import { createInMemoryPriceAlertStore } from "../../src/price-alerts/store.js";
import { checkPriceAlert, checkPriceAlerts, createMockPriceFetcher, isAlertTriggered } from "../../src/price-alerts/checker.js";

describe("price-alerts store", () => {
  it("household isolation", async () => {
    const store = createInMemoryPriceAlertStore();
    await store.createAlert("hh-a", { productName: "Arroz", targetPriceCents: 1000, condition: "below" });
    await store.createAlert("hh-b", { productName: "Feijão", targetPriceCents: 2000, condition: "above" });
    const a = await store.listAlerts("hh-a");
    const b = await store.listAlerts("hh-b");
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]!.productName).toBe("Arroz");
    expect(b[0]!.productName).toBe("Feijão");
  });

  it("trims productName", async () => {
    const store = createInMemoryPriceAlertStore();
    const alert = await store.createAlert("hh-a", { productName: "  Café  ", targetPriceCents: 500, condition: "below" });
    expect(alert.productName).toBe("Café");
  });
});

describe("checker logic", () => {
  it("below triggered when current <= target", () => {
    const alert = { id: "1", householdId: "hh", productName: "Arroz", targetPriceCents: 1000, condition: "below" as const, createdAt: new Date().toISOString() };
    expect(isAlertTriggered(alert, 1000)).toBe(true);
    expect(isAlertTriggered(alert, 999)).toBe(true);
    expect(isAlertTriggered(alert, 1001)).toBe(false);
  });

  it("above triggered when current >= target", () => {
    const alert = { id: "1", householdId: "hh", productName: "Arroz", targetPriceCents: 1000, condition: "above" as const, createdAt: new Date().toISOString() };
    expect(isAlertTriggered(alert, 1000)).toBe(true);
    expect(isAlertTriggered(alert, 1001)).toBe(true);
    expect(isAlertTriggered(alert, 999)).toBe(false);
  });

  it("checkPriceAlert generates notification when triggered", () => {
    const alert = { id: "a1", householdId: "hh", productName: "Leite", targetPriceCents: 500, condition: "below" as const, createdAt: new Date().toISOString() };
    const n = checkPriceAlert(alert, 400);
    expect(n).not.toBeNull();
    expect(n!.alertId).toBe("a1");
    expect(n!.triggered).toBe(true);
    expect(n!.message).toContain("Leite");
  });

  it("checkPriceAlert returns null when not triggered", () => {
    const alert = { id: "a1", householdId: "hh", productName: "Leite", targetPriceCents: 500, condition: "below" as const, createdAt: new Date().toISOString() };
    expect(checkPriceAlert(alert, 600)).toBeNull();
  });

  it("checkPriceAlerts com mock fetcher", async () => {
    const store = createInMemoryPriceAlertStore();
    await store.createAlert("hh", { productName: "Arroz", targetPriceCents: 2000, condition: "below" });
    await store.createAlert("hh", { productName: "Café", targetPriceCents: 1000, condition: "above" });
    const alerts = await store.listAlerts("hh");
    const fetcher = createMockPriceFetcher({ Arroz: 1500, Café: 1200 });
    const notifications = await checkPriceAlerts(alerts, fetcher);
    // Arroz 1500 <= 2000 below => triggered, Café 1200 >= 1000 above => triggered
    expect(notifications).toHaveLength(2);
  });

  it("mock fetcher fallback determinístico", async () => {
    const fetcher = createMockPriceFetcher({});
    const p1 = await fetcher("Produto X");
    const p2 = await fetcher("Produto X");
    expect(p1).toBe(p2);
    expect(p1).toBeGreaterThanOrEqual(500);
  });
});
