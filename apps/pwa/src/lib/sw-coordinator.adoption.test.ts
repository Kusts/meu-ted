import { describe, expect, it } from "vitest";
import { consumeAdoptionMarker } from "./sw-coordinator";

describe("notification adoption marker", () => {
  it("extracts the opened event from a URL opened without an existing client", () => {
    expect(
      consumeAdoptionMarker("/a-pagar?pwa_adoption=notification_opened"),
    ).toEqual({
      eventType: "notification_opened",
      cleanPath: "/a-pagar",
    });
  });
});
