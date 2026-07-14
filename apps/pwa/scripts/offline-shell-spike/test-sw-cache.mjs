#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { chromium } from "playwright";

const P = "public", PORT = 3456, BASE = `http://localhost:${PORT}`;
const SHELL = ["/","/registros","/contas","/categorias","/a-pagar","/orcamentos","/metas","/cartoes","/assinaturas","/patrimonio","/relatorios","/perfil"];

const srv = http.createServer((req, res) => {
  const p = req.url.split("?")[0];
  if (SHELL.includes(p)) return sf(res, "offline-shell.html", "text/html");
  if (p === "/offline-shell.js") return sf(res, "offline-shell.js", "application/javascript");
  if (p === "/sw.js") return sf(res, "sw.js", "application/javascript");
  if (p.startsWith("/_next/static")) { res.writeHead(200,{"Content-Type":"application/javascript","Cache-Control":"public,max-age=3600"}); return res.end("// static chunk"); }
  const ff = path.join(P, p);
  if (fs.existsSync(ff) && !fs.statSync(ff).isDirectory()) { const mt = {".html":"text/html",".js":"application/javascript",".png":"image/png",".ico":"image/x-icon"}[path.extname(ff)] || "text/html"; res.writeHead(200,{"Content-Type":mt}); return fs.createReadStream(ff).pipe(res); }
  if (p.endsWith(".html") && !p.includes("offline-shell")) { res.writeHead(200,{"Content-Type":"text/html","Content-Security-Policy":"script-src 'nonce-abc123'"}); return res.end("<html nonce='abc123'>route</html>"); }
  if (p.startsWith("/api/")) { res.writeHead(200,{"Content-Type":"application/json","Authorization":"Bearer test"}); return res.end("{}"); }
  const u = new URL(req.url, BASE);
  if (u.searchParams.has("_rsc")) { res.writeHead(200,{"Content-Type":"text/html"}); return res.end("<html>rsc</html>"); }
  if (p.startsWith("/pwa-control")) { res.writeHead(200,{"Content-Type":"text/html"}); return res.end("<html>control</html>"); }
  if (p.startsWith("/_next/data")) { res.writeHead(200,{"Content-Type":"application/json"}); return res.end("{}"); }
  if (p === "/cross-origin") { res.writeHead(200,{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}); return res.end("{}"); }
  res.writeHead(200,{"Content-Type":"text/html"}); res.end("<html>fallback</html>");
});
function sf(res, f, m) { const fp = path.join(P,f); if (fs.existsSync(fp)) { res.writeHead(200,{"Content-Type":m}); return fs.createReadStream(fp).pipe(res); } res.writeHead(404); res.end(); }

async function run() {
  await new Promise(r => srv.listen(PORT, r));
  console.log(`Server at ${BASE}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 1. Origin + SW registration
  await page.goto(`${BASE}/registros`, { timeout: 5e3 });
  console.log("Page loaded");
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.register("/sw.js");
    for (let i = 0; i < 60; i++) { if (navigator.serviceWorker.controller?.state === "activated") return; await new Promise(r => setTimeout(r, 250)); }
  });
  console.log("SW activated");

  // 2. Populate caches — permitted routes
  for (const r of ["/registros","/contas","/","/_next/static/chunks/app/layout-hash.js","/_next/static/chunks/framework-abc.js","/_next/static/css/app/layout.css","/_next/static/media/font.woff2"])
    await page.goto(BASE + r, { waitUntil: "load", timeout: 3e3 }).catch(() => {});
  // 2b. Rejected request types
  for (const r of ["/api/accounts","/_next/data/build-id/r.json","/pwa-control/sync","/registros?_rsc=abc","/cross-origin","/route-example.html"])
    await page.goto(BASE + r, { waitUntil: "load", timeout: 3e3 }).catch(() => {});
  await new Promise(r => setTimeout(r, 500));

  // 3. Inspect caches
  const all = await page.evaluate(async () => {
    const out = []; const names = await caches.keys();
    for (const n of names) { const c = await caches.open(n); const reqs = await c.keys(); for (const r of reqs) out.push({ cache: n, url: r.url.replace(/http:\/\/localhost:3456/g, "") }); }
    return out;
  });

  const shell = all.filter(e => e.url.includes("offline-shell"));
  const stat = all.filter(e => e.url.startsWith("/_next/static"));
  const api = all.filter(e => e.url.startsWith("/api/"));
  const rsc = all.filter(e => e.url.includes("_rsc"));
  const pwa = all.filter(e => e.url.startsWith("/pwa-control"));
  const nd = all.filter(e => e.url.startsWith("/_next/data"));
  const co = all.filter(e => e.url.startsWith("/cross-origin"));
  const rt = all.filter(e => e.url.endsWith(".html") && !e.url.includes("offline"));

  console.log("\n=== CACHE STORAGE ===");
  console.log(`shell:          ${shell.length} (exp ≤2)            ${shell.length<=2?"PASS ✓":"FAIL ✗"}`);
  console.log(`_next/static:   ${stat.length} (exp ≥2)            ${stat.length>=2?"PASS ✓":"FAIL ✗"}`);
  console.log(`api:            ${api.length} (exp 0)              ${api.length===0?"PASS ✓":"FAIL ✗"}`);
  console.log(`_rsc:           ${rsc.length} (exp 0)              ${rsc.length===0?"PASS ✓":"FAIL ✗"}`);
  console.log(`pwa-control:    ${pwa.length} (exp 0)              ${pwa.length===0?"PASS ✓":"FAIL ✗"}`);
  console.log(`_next/data:     ${nd.length} (exp 0)              ${nd.length===0?"PASS ✓":"FAIL ✗"}`);
  console.log(`cross-origin:   ${co.length} (exp 0)              ${co.length===0?"PASS ✓":"FAIL ✗"}`);
  console.log(`route HTML:     ${rt.length} (exp 0)              ${rt.length===0?"PASS ✓":"FAIL ✗"}`);
  all.forEach(e => console.log(`  [${e.cache}] ${e.url}`));

  // 4. Offline /registros fallback (SW serves from pi-finance-shell cache)
  console.log("\n=== OFFLINE /registros ===");
  // Block network so SW must serve cached
  await page.route("**/*", route => route.abort("internetdisconnected"));
  try {
    await page.goto(`${BASE}/registros`, { waitUntil: "domcontentloaded", timeout: 8e3 });
    const h = await page.content();
    const ok = h.includes("Modo offline") && (h.includes("Últimos") || h.includes("Nenhum"));
    console.log(`offline:        ${ok?"PASS ✓":"FAIL ✗"}`);
    if (!ok) console.log(`  rendered: ${h.replace(/<[^>]+>/g,"").substring(0,80).trim()}`);
  } catch (e) { console.log(`offline:        FAIL ✗ (${e.message?.substring(0,100)})`); }

  // 5. Gzip total
  const hf = fs.readFileSync(path.join(P,"offline-shell.html"));
  const jf = fs.readFileSync(path.join(P,"offline-shell.js"));
  const sf = fs.readFileSync(path.join(P,"sw.js"));
  const gz = (zlib.gzipSync(hf).length + zlib.gzipSync(jf).length + zlib.gzipSync(sf).length) / 1024;
  console.log(`gzip total:     ${gz.toFixed(1)} KB (≤2000 KB)     ${gz<=2000?"PASS ✓":"FAIL ✗"}`);

  const pass = shell.length <= 2 && stat.length >= 2 && api.length+rsc.length+pwa.length+nd.length+co.length+rt.length === 0;
  console.log(`\nOVERALL:       ${pass ? "PASS ✓" : "FAIL ✗"}`);
  await browser.close(); srv.close();
  if (!pass) process.exit(1);
}
run().catch(e => { console.error("FATAL:", e.message?.substring(0,200)); srv.close(); process.exit(1); });
