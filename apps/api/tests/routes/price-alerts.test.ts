import { describe, it, expect } from "vitest";
import { buildTestApp, TOKEN_A, TOKEN_B } from "../test-app.js";

function auth(t: string) {
  return { "x-device-token": t };
}

describe("GET /alerts/price", () => {
  it("401 sem token", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: "GET", url: "/alerts/price" });
    expect(res.statusCode).toBe(401);
  });

  it("200 lista vazia autenticado", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: "GET", url: "/alerts/price", headers: auth(TOKEN_A) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("isolamento household: B não vê alertas de A", async () => {
    const { app } = buildTestApp();
    await app.inject({
      method: "POST",
      url: "/alerts/price",
      headers: { ...auth(TOKEN_A), "Content-Type": "application/json" },
      payload: { productName: "Arroz 5kg", targetPriceCents: 2500, condition: "below" },
    });
    const resB = await app.inject({ method: "GET", url: "/alerts/price", headers: auth(TOKEN_B) });
    expect(resB.statusCode).toBe(200);
    expect(resB.json().items).toHaveLength(0);

    const resA = await app.inject({ method: "GET", url: "/alerts/price", headers: auth(TOKEN_A) });
    expect(resA.json().items).toHaveLength(1);
    expect(resA.json().items[0].productName).toBe("Arroz 5kg");
  });
});

describe("POST /alerts/price", () => {
  it("401 sem token", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/alerts/price",
      headers: { "Content-Type": "application/json" },
      payload: { productName: "Arroz", targetPriceCents: 1000, condition: "below" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("200 cria e lista", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/alerts/price",
      headers: { ...auth(TOKEN_A), "Content-Type": "application/json" },
      payload: { productName: "Café 500g", targetPriceCents: 1500, condition: "above" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeTruthy();
    expect(body.productName).toBe("Café 500g");
    expect(body.targetPriceCents).toBe(1500);
    expect(body.condition).toBe("above");
    expect(body.householdId).toBeTruthy();

    const list = await app.inject({ method: "GET", url: "/alerts/price", headers: auth(TOKEN_A) });
    expect(list.json().items).toHaveLength(1);
  });

  it("400 body inválido — condition inválida", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/alerts/price",
      headers: { ...auth(TOKEN_A), "Content-Type": "application/json" },
      payload: { productName: "X", targetPriceCents: 100, condition: "invalid" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("validation.error");
  });

  it("400 targetPriceCents negativo", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/alerts/price",
      headers: { ...auth(TOKEN_A), "Content-Type": "application/json" },
      payload: { productName: "Arroz", targetPriceCents: -100, condition: "below" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("400 productName vazio", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/alerts/price",
      headers: { ...auth(TOKEN_A), "Content-Type": "application/json" },
      payload: { productName: "   ", targetPriceCents: 1000, condition: "below" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("400 body ausente", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/alerts/price",
      headers: { ...auth(TOKEN_A), "Content-Type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("isolamento POST: alerta de A não aparece para B e vice-versa", async () => {
    const { app } = buildTestApp();
    await app.inject({
      method: "POST",
      url: "/alerts/price",
      headers: { ...auth(TOKEN_A), "Content-Type": "application/json" },
      payload: { productName: "Feijão", targetPriceCents: 800, condition: "below" },
    });
    await app.inject({
      method: "POST",
      url: "/alerts/price",
      headers: { ...auth(TOKEN_B), "Content-Type": "application/json" },
      payload: { productName: "Soja", targetPriceCents: 900, condition: "above" },
    });
    const listA = await app.inject({ method: "GET", url: "/alerts/price", headers: auth(TOKEN_A) });
    const listB = await app.inject({ method: "GET", url: "/alerts/price", headers: auth(TOKEN_B) });
    expect(listA.json().items[0].productName).toBe("Feijão");
    expect(listB.json().items[0].productName).toBe("Soja");
    expect(listA.json().total).toBe(1);
    expect(listB.json().total).toBe(1);
  });
});

describe("POST /alerts/price/check — checker mock", () => {
  it("401 sem token", async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/alerts/price/check",
      headers: { "Content-Type": "application/json" },
      payload: { currentPriceCents: 1000 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("200 gera notificação quando condition atingida (below)", async () => {
    const { app } = buildTestApp();
    await app.inject({
      method: "POST",
      url: "/alerts/price",
      headers: { ...auth(TOKEN_A), "Content-Type": "application/json" },
      payload: { productName: "Arroz", targetPriceCents: 2000, condition: "below" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/alerts/price/check",
      headers: { ...auth(TOKEN_A), "Content-Type": "application/json" },
      payload: { currentPriceCents: 1500, productName: "Arroz" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().notifications).toHaveLength(1);
    expect(res.json().notifications[0].triggered).toBe(true);
  });

  it("200 não gera notificação quando condition não atingida", async () => {
    const { app } = buildTestApp();
    await app.inject({
      method: "POST",
      url: "/alerts/price",
      headers: { ...auth(TOKEN_A), "Content-Type": "application/json" },
      payload: { productName: "Café", targetPriceCents: 1000, condition: "below" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/alerts/price/check",
      headers: { ...auth(TOKEN_A), "Content-Type": "application/json" },
      payload: { currentPriceCents: 1500, productName: "Café" },
    });
    expect(res.json().notifications).toHaveLength(0);
  });

  it("isolamento check: não vaza notificação entre households", async () => {
    const { app } = buildTestApp();
    await app.inject({
      method: "POST",
      url: "/alerts/price",
      headers: { ...auth(TOKEN_A), "Content-Type": "application/json" },
      payload: { productName: "Açúcar", targetPriceCents: 5000, condition: "below" },
    });
    const resB = await app.inject({
      method: "POST",
      url: "/alerts/price/check",
      headers: { ...auth(TOKEN_B), "Content-Type": "application/json" },
      payload: { currentPriceCents: 1000, productName: "Açúcar" },
    });
    expect(resB.json().notifications).toHaveLength(0);
  });
});
