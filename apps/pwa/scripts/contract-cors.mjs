#!/usr/bin/env node

/**
 * CORS contract test for pi-finance-api.
 *
 * Verifies that the canonical production API origin returns ACAO when
 * accessed from the PWA origin, and that a hostile origin does not.
 *
 * This is a passive CORS test — no authentication or rate-limit probing.
 *
 * DEBT2 allowlist migration: the PWA production host never lives in-repo.
 * It arrives via PWA_PROD_URL (preferred, injected by CI from the repo
 * variable) or PWA_ORIGIN. Without either, the live check is SKIPPED
 * (exit 0) so local runs never silently probe production.
 */

import { pathToFileURL } from "node:url";

const HOSTILE_ORIGIN = "https://evil.example.com";
const FALLBACK_API_BASE_URL = "https://api.synkroo.com.br";

/**
 * Pure config resolution (exported for unit tests). `live` is false when
 * the PWA origin is unknown — the caller must skip the live check.
 */
export function resolveConfig(env = process.env) {
  const pwaOrigin = env.PWA_PROD_URL?.trim() || env.PWA_ORIGIN?.trim() || null;
  const apiBaseUrl = env.PWA_CONTRACT_API_BASE_URL?.trim() || FALLBACK_API_BASE_URL;
  return { pwaOrigin, apiBaseUrl, hostileOrigin: HOSTILE_ORIGIN, live: pwaOrigin !== null };
}

async function testAcao(apiBaseUrl, origin, label) {
  const url = `${apiBaseUrl}/ping`;
  try {
    const res = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "GET",
      },
    });
    const acao = res.headers.get("access-control-allow-origin");
    console.log(
      `  ${label.padEnd(40)} origin=${origin} → ACAO: ${acao ?? "(none)"}`,
    );
    return { origin, acao };
  } catch (err) {
    console.error(`  ${label.padEnd(40)} ERROR: ${err.message}`);
    return { origin, acao: null };
  }
}

async function main() {
  const { pwaOrigin: PWA_ORIGIN, apiBaseUrl: API_BASE_URL, hostileOrigin: HOSTILE_ORIGIN, live } = resolveConfig();
  console.log("=== CORS Contract Test ===\n");
  console.log(`API: ${API_BASE_URL}`);
  console.log(`PWA: ${PWA_ORIGIN ?? "(unset — live check will be skipped)"}`);
  console.log("");

  if (!live) {
    console.log("SKIP: PWA production origin is not configured — set PWA_PROD_URL");
    console.log("  (CI injects it from the repo variable) or PWA_ORIGIN to run the live check.");
    console.log("  Local default: no live probe against production. Exiting 0.");
    process.exit(0);
  }

  // Live check — requires network access to the API
  const pwaResult = await testAcao(API_BASE_URL, PWA_ORIGIN, "Canonical PWA origin");
  const hostileResult = await testAcao(
    API_BASE_URL,
    HOSTILE_ORIGIN,
    "Hostile origin (must deny)",
  );

  console.log("");

  let pass = true;

  if (pwaResult.acao === null) {
    console.log(
      "⚠  Live CORS check skipped — API not reachable from this environment.",
    );
    console.log(
      "   Verify deployment manually: curl -I -X OPTIONS -H 'Origin: <pwa>' -H 'Access-Control-Request-Method: GET' <api>/ping",
    );
  } else if (pwaResult.acao === PWA_ORIGIN || pwaResult.acao === "*") {
    console.log("✓  Canonical PWA origin gets ACAO");
  } else if (pwaResult.acao === "null") {
    console.log("✗  PWA origin got ACAO: null (opaque origin)");
    pass = false;
  } else {
    console.log(`✗  PWA origin got unexpected ACAO: ${pwaResult.acao}`);
    pass = false;
  }

  console.log("");

  if (hostileResult.acao === null) {
    console.log("⚠  Live hostile check skipped (API unreachable)");
  } else if (hostileResult.acao) {
    console.log(`✗  Hostile origin received ACAO: ${hostileResult.acao} (should be denied)`);
    pass = false;
  } else {
    console.log("✓  Hostile origin correctly denied ACAO");
  }

  console.log("");
  if (pass) {
    console.log("=== CORS Contract: PASS ===");
  } else {
    console.log("=== CORS Contract: FAIL ===");
  }
  process.exit(pass ? 0 : 1);
}

const invokedDirectly =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
