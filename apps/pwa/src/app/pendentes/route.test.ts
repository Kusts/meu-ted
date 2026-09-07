import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /pendentes (item 13)", () => {
  it("issues a permanent 308 redirect to compromissos pendencias", async () => {
    const res = await GET(new Request("http://localhost:3000/pendentes"));

    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("http://localhost:3000/compromissos?aba=pendencias");
  });

  it("preserves the query string in the redirect target", async () => {
    const res = await GET(
      new Request("http://localhost:3000/pendentes?token=abc&x=1"),
    );

    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/compromissos?aba=pendencias&token=abc&x=1",
    );
  });
});