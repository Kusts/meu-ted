"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

export type CaptureParams = Pick<URLSearchParams, "get">;

export function buildCaptureDescription(params: CaptureParams): string {
  return (
    params.get("text")?.trim() ||
    params.get("title")?.trim() ||
    params.get("url")?.trim() ||
    ""
  );
}

export function CaptureBridge() {
  const params = useSearchParams();
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    const flowId = crypto.randomUUID();

    window.dispatchEvent(
      new CustomEvent("pwa:open-tx", {
        detail: {
          kind: "expense",
          description: buildCaptureDescription(params),
          flowId,
        },
      }),
    );
    window.history.replaceState(null, "", "/");
  }, [params]);

  return null;
}
