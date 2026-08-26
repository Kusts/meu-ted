import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const appRoot = process.cwd();
const standaloneRoot = path.join(appRoot, ".next", "standalone", "apps", "pwa");
const copyIfPresent = (source, target) => {
  if (fs.existsSync(source)) fs.cpSync(source, target, { recursive: true, force: true });
};

copyIfPresent(path.join(appRoot, ".next", "static"), path.join(standaloneRoot, ".next", "static"));
copyIfPresent(path.join(appRoot, "public"), path.join(standaloneRoot, "public"));
process.env.PORT ??= "3001";
process.env.HOSTNAME ??= "127.0.0.1";
process.chdir(standaloneRoot);
await import(pathToFileURL(path.join(standaloneRoot, "server.js")).href);
