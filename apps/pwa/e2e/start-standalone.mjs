import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const portIndex = process.argv.indexOf("--port");
const port = portIndex >= 0 ? process.argv[portIndex + 1] : "3001";
const root = resolve(import.meta.dirname, "..");
const standaloneRoot = resolve(root, ".next/standalone/apps/pwa");

cpSync(resolve(root, ".next/static"), resolve(standaloneRoot, ".next/static"), { recursive: true });
if (existsSync(resolve(root, "public"))) {
  cpSync(resolve(root, "public"), resolve(standaloneRoot, "public"), { recursive: true });
}

process.env.PORT = port;
process.env.HOSTNAME = "127.0.0.1";
await import(pathToFileURL(resolve(standaloneRoot, "server.js")));
