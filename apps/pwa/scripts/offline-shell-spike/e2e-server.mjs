// E2E test server — serves offline shell, sw.js, static chunks, API, etc.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const P = "public", PORT = 3456;
const SHELL = ["/","/registros","/contas","/categorias","/a-pagar","/orcamentos","/metas","/cartoes","/assinaturas","/patrimonio","/relatorios","/perfil"];

const srv = http.createServer((req, res) => {
  const p = req.url.split("?")[0];
  if (SHELL.includes(p)) return sf(res, "offline-shell.html", "text/html");
  if (p === "/offline-shell.js") return sf(res, "offline-shell.js", "application/javascript");
  if (p === "/sw.js") return sf(res, "sw.js", "application/javascript");
  if (p.startsWith("/_next/static")) { res.writeHead(200,{"Content-Type":"application/javascript","Cache-Control":"public,max-age=3600"}); return res.end("// static chunk"); }
  const ff = path.join(P, p);
  if (fs.existsSync(ff) && !fs.statSync(ff).isDirectory()) { const mt = {".html":"text/html",".js":"application/javascript",".png":"image/png",".ico":"image/x-icon"}[path.extname(ff)]||"text/html"; res.writeHead(200,{"Content-Type":mt}); return fs.createReadStream(ff).pipe(res); }
  if (p.endsWith(".html") && !p.includes("offline-shell")) { res.writeHead(200,{"Content-Type":"text/html","Content-Security-Policy":"script-src 'nonce-abc123'"}); return res.end("<html nonce='abc123'>route</html>"); }
  if (p.startsWith("/api/")) { res.writeHead(200,{"Content-Type":"application/json","Authorization":"Bearer test"}); return res.end("{}"); }
  if (p.startsWith("/pwa-control")) { res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"}); return res.end(JSON.stringify({enabled:true,version:"3.3.0"})); }
  res.writeHead(200,{"Content-Type":"text/html"}); res.end("<html>fallback</html>");
});
function sf(res, f, m) { const fp = path.join(P,f); if (fs.existsSync(fp)) { res.writeHead(200,{"Content-Type":m}); return fs.createReadStream(fp).pipe(res); } res.writeHead(404); res.end(); }

srv.listen(PORT, () => console.log(`E2E server at http://localhost:${PORT}`));
