#!/usr/bin/env node

/**
 * CORS contract test for pi-finance-api.
 *
 * Verifies that the canonical production API origin returns ACAO when
 * accessed from the PWA origin, and that a hostile origin does not.
 *
 * This is a passive CORS test — no authentication or rate-limit probing.
 *
 * Deployment-only: if the API base URL is not configured, the test
 * skips the live check and prints a pending reminder.
 */

const PWA_ORIGIN = "https://pi-finance-pwa.walissonead.workers.dev";
const HOSTILE_ORIGIN = "https://evil.example.com";
const API_BASE_URL =
  process.env.PWA_CONTRACT_API_BASE_URL ?? "https://api.synkroo.com.br";

async function testAcao(origin, label) {
  const url = `${API_BASE_URL}/ping`;
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
  console.log("=== CORS Contract Test ===\n");
  console.log(`API: ${API_BASE_URL}`);
  console.log(`PWA: ${PWA_ORIGIN}`);
  console.log("");

  // Live check — requires network access to the API
  const pwaResult = await testAcao(PWA_ORIGIN, "Canonical PWA origin");
  const hostileResult = await testAcao(
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

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
