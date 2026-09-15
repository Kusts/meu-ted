import { describe, it, expect } from "vitest";
import { getChatAttachmentCapabilities } from "./capabilities";

describe("chatAttachmentCapabilities (SPEC §18)", () => {
  it("defaults to ALL FALSE when the flag is absent", () => {
    expect(getChatAttachmentCapabilities({})).toEqual({ image: false, pdf: false, audio: false });
  });

  it("defaults to ALL FALSE for any value other than \"1\"", () => {
    for (const value of ["0", "true", "yes", "", "2"]) {
      expect(getChatAttachmentCapabilities({ NEXT_PUBLIC_TED_ATTACHMENT_INGESTION: value })).toEqual({
        image: false,
        pdf: false,
        audio: false,
      });
    }
  });

  it("enables ALL capabilities only when the flag is exactly \"1\"", () => {
    expect(
      getChatAttachmentCapabilities({ NEXT_PUBLIC_TED_ATTACHMENT_INGESTION: "1" }),
    ).toEqual({ image: true, pdf: true, audio: true });
  });
});
