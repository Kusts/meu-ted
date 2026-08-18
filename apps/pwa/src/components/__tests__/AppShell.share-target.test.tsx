import { describe, expect, it } from "vitest";
import { parseOpenTransactionEvent } from "@/components/AppShell";

describe("AppShell share-target event", () => {
  it("reads the shared description from the open-transaction event", () => {
    const event = new CustomEvent("pwa:open-tx", {
      detail: { kind: "expense", description: "Mercado" },
    });

    expect(parseOpenTransactionEvent(event)).toEqual({
      kind: "expense",
      description: "Mercado",
    });
  });
});
