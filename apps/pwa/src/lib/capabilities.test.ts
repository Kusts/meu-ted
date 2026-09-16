import { describe, it, expect } from "vitest";
import { getChatAttachmentCapabilities, isMicrophoneEnabled } from "./capabilities";

describe("chatAttachmentCapabilities (SPEC §18)", () => {
  it("defaults to ALL FALSE when the flag is absent", () => {
    expect(getChatAttachmentCapabilities({})).toEqual({
      image: false,
      pdf: false,
      audio: false,
      microphone: false,
    });
  });

  it("defaults to ALL FALSE for any value other than \"1\"", () => {
    for (const value of ["0", "true", "yes", "", "2"]) {
      expect(getChatAttachmentCapabilities({ NEXT_PUBLIC_TED_ATTACHMENT_INGESTION: value })).toEqual({
        image: false,
        pdf: false,
        audio: false,
        microphone: false,
      });
    }
  });

  it("enables ALL capabilities only when the flag is exactly \"1\"", () => {
    expect(
      getChatAttachmentCapabilities({ NEXT_PUBLIC_TED_ATTACHMENT_INGESTION: "1" }),
    ).toEqual({ image: true, pdf: true, audio: true, microphone: false });
  });
});

describe("isMicrophoneEnabled (V4 T1.1)", () => {
  it("defaults to false when the flag is absent", () => {
    expect(isMicrophoneEnabled({})).toBe(false);
  });

  it("defaults to false for any value other than \"1\" or \"true\"", () => {
    for (const value of ["0", "yes", "", "2", "TRUE"]) {
      expect(isMicrophoneEnabled({ NEXT_PUBLIC_TED_MICROPHONE: value })).toBe(false);
    }
  });

  it("enables only for exactly \"1\" or \"true\" (deploy sets \"true\")", () => {
    expect(isMicrophoneEnabled({ NEXT_PUBLIC_TED_MICROPHONE: "1" })).toBe(true);
    expect(isMicrophoneEnabled({ NEXT_PUBLIC_TED_MICROPHONE: "true" })).toBe(true);
  });

  it("flows into the shared caps object (UI and header read the same flag)", () => {
    expect(
      getChatAttachmentCapabilities({ NEXT_PUBLIC_TED_MICROPHONE: "true" }).microphone,
    ).toBe(true);
  });
});
