import { describe, it, expect, beforeEach } from "vitest";
import {
  acquireBodyScrollLock,
  releaseBodyScrollLock,
  bodyScrollLockCount,
  OVERLAY_Z_INDEX,
} from "../overlay-a11y";

describe("body scroll lock ref counting (P1-3)", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
    while (bodyScrollLockCount() > 0) releaseBodyScrollLock();
  });

  it("locks the body on first acquire preserving the original overflow", () => {
    document.body.style.overflow = "scroll";
    acquireBodyScrollLock();
    expect(document.body.style.overflow).toBe("hidden");
    expect(bodyScrollLockCount()).toBe(1);
    releaseBodyScrollLock();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("does not unlock while another overlay still holds the lock", () => {
    document.body.style.overflow = "";
    acquireBodyScrollLock();
    acquireBodyScrollLock();
    expect(document.body.style.overflow).toBe("hidden");
    expect(bodyScrollLockCount()).toBe(2);

    releaseBodyScrollLock();
    expect(document.body.style.overflow).toBe("hidden");

    releaseBodyScrollLock();
    expect(document.body.style.overflow).toBe("");
  });

  it("ignores release without a matching acquire", () => {
    releaseBodyScrollLock();
    expect(bodyScrollLockCount()).toBe(0);
  });
});

describe("overlay z-index layers (P1-3)", () => {
  it("stacks confirm dialogs above sheets and dialogs", () => {
    expect(OVERLAY_Z_INDEX.confirmAction).toBeGreaterThan(OVERLAY_Z_INDEX.sheet);
    expect(OVERLAY_Z_INDEX.confirmAction).toBeGreaterThan(OVERLAY_Z_INDEX.dialog);
  });
});
