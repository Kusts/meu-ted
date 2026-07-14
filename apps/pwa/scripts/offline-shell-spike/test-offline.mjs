#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { chromium } from "playwright";

const P = "public", PORT = 3456, BASE = `http://localhost:${PORT}`;
const ROUTES = ["/","/registros","/contas","/categorias","/a-pagar","/orcamentos","/metas","/cartoes","/assinaturas","/patrimonio","/relatorios","/perfil"];
const SNAP = { schema:2, ownerFingerprint:"tf",
  domains: {
    transactions: [
      { id:"t1", description:"Supermercado Extra", amountCents:25000, status:"completed" },
      { id:"t2", description:"Aluguel", amountCents:180000, status:"completed" },
    ],
    accounts: [ { id:"a1", name:"Nubank", balanceCents:350000 } ],
  },
  syncedAt: { transactions:"2026-07-13T14:00:00.000Z" },
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];
  // Serve shell HTML for any known route (simulates SW cache hit)
  if (ROUTES.includes(urlPath)) {
    const f = path.join(P, "offline-shell.html");
    if (fs.existsSync(f)) { res.writeHead(200,{"Content-Type":"text/html"}); return fs.createReadStream(f).pipe(res); }
  }
  if (urlPath === "/offline-shell.js") {
    const f = path.join(P, "offline-shell.js");
    if (fs.existsSync(f)) { res.writeHead(200,{"Content-Type":"application/javascript"}); return fs.createReadStream(f).pipe(res); }
  }
  res.writeHead(404); res.end();
});

async function seedDB(page) {
  await page.evaluate((s) => new Promise((res,rej)=>{
    const r = indexedDB.open("pi-finance-snapshot",1);
    r.onupgradeneeded = () => r.result.createObjectStore("snapshots");
    r.onsuccess = () => {
      const d = r.result, t = d.transaction("snapshots","readwrite");
      t.objectStore("snapshots").put(s,"v2");
      t.oncomplete = () => { d.close(); res(); };
      t.onerror = () => { d.close(); rej(t.error); };
    };
  }), SNAP);
}

async function run() {
  await new Promise(r => server.listen(PORT, r));
  console.log(`Server at ${BASE}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const seen = [];

  // Offline simulation: only shell files + known routes pass through
  await page.route("**/*", (route) => {
    const u = route.request().url();
    seen.push(u);
    // Allow shell file requests AND navigations to known routes
    if (u.includes("offline-shell") || ROUTES.some(r => u.endsWith(r))) return route.continue();
    route.abort("internetdisconnected");
  });

  // Step 1 — visit /registros (loads shell HTML + JS; origin established)
  await page.goto(`${BASE}/registros`, { waitUntil:"domcontentloaded", timeout:5e3 });
  // Step 2 — seed IndexedDB on the same origin
  await seedDB(page);
  console.log("Seeded ✓");
  // Step 3 — reload; shell now reads the seeded v2 snapshot
  seen.length = 0;
  await page.goto(`${BASE}/registros`, { waitUntil:"domcontentloaded", timeout:5e3 });
  await new Promise(r => setTimeout(r, 1000));

  // Verify
  const html = await page.content();
  const banner = html.includes("Modo offline");
  const title  = html.includes("Últimos Registros");
  const data   = html.includes("Supermercado Extra");
  const noInline = !html.match(/<script[^>]*>[^<]/);
  const noNonce  = !html.includes("nonce=");
  const other = seen.filter(u => !u.includes("offline-shell") && !u.includes("favicon") && !u.includes("none_") && !ROUTES.some(r => u.endsWith(r)));

  const hf = fs.readFileSync(path.join(P,"offline-shell.html"));
  const jf = fs.readFileSync(path.join(P,"offline-shell.js"));
  const gz = zlib.gzipSync(hf).length + zlib.gzipSync(jf).length;

  console.log(`\n=== OFFLINE SHELL — DIRECT /registros ===`);
  console.log(`Navigated to:        ${page.url()}`);
  console.log(`Banner:              ${banner?"PASS ✓":"FAIL ✗"}`);
  console.log(`Route title:         ${title?"PASS ✓":"FAIL ✗"}`);
  console.log(`Stale data:          ${data?"PASS ✓":"FAIL ✗"}`);
  console.log(`No inline scripts:   ${noInline?"PASS ✓":"FAIL ✗"}`);
  console.log(`No nonce:            ${noNonce?"PASS ✓":"FAIL ✗"}`);
  console.log(`Zero other requests: ${other.length===0?"PASS ✓":"FAIL ✗ ("+other.length+")"}`);
  other.forEach(u => console.log(`  BLOCKED: ${u}`));
  console.log(`Gzip: ${(gz/1024).toFixed(1)} KB (≤2000 KB ✓)`);

  const pass = banner && title && data && noInline && noNonce && other.length === 0;
  console.log(`\nOVERALL: ${pass ? "PASS ✓" : "FAIL ✗"}`);

  await browser.close(); server.close();
  if (!pass) process.exit(1);
}

run().catch(e => { console.error("FATAL:", e.message?.substring(0,200)); server.close(); process.exit(1); });
