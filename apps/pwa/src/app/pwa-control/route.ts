// pwa-control — SW status endpoint. GET only, Cache-Control: no-store.
// Uses getCloudflareContext() from @opennextjs/cloudflare to read env bindings.

import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

export async function GET() {
  let enabled = true;
  try {
    const ctx = await getCloudflareContext({ async: true });
    enabled = ctx?.env?.PWA_SW_ENABLED !== "false";
  } catch {
    enabled = process.env.PWA_SW_ENABLED !== "false";
  }
  return new Response(JSON.stringify({ version: "3.3.0", enabled }), {
    headers: { "content-type": "application/json", "cache-control": "no-store, max-age=0" },
  });
}
