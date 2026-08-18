#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function generateRuntimeFacts() {
  const pwaPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "apps", "pwa", "package.json"), "utf8"));
  const apiPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "apps", "api", "package.json"), "utf8"));
  const agentPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "apps", "agent", "package.json"), "utf8"));

  const sqlDir = path.join(ROOT, "apps", "api", "src", "read-models", "sql");
  const migrations = fs.existsSync(sqlDir)
    ? fs.readdirSync(sqlDir).filter((f) => f.startsWith("V") && f.endsWith(".sql")).sort()
    : [];

  const inventorySource = fs.readFileSync(path.join(ROOT, "apps", "api", "src", "routes", "route-inventory.ts"), "utf8");
  const routeMatches = [...inventorySource.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
  const uniqueRoutes = Array.from(new Set(routeMatches));

  return {
    version: "1.0.0",
    lastVerified: "2026-08-18",
    activeWorkspaces: ["apps/api", "apps/pwa", "apps/agent", "apps/whatsapp-bridge"],
    apps: {
      api: {
        name: apiPkg.name || "@pi-financeiro/api",
        framework: "Fastify",
        runtime: "Node.js (Hostinger VPS)",
      },
      pwa: {
        name: pwaPkg.name || "@pi-financeiro/pwa",
        framework: "Next.js / React (Static Export / OpenNext)",
        runtime: "Cloudflare Pages",
      },
      agent: {
        name: agentPkg.name || "@pi-financeiro/agent",
        framework: "Cloudflare Workers / Agents SDK",
        runtime: "Cloudflare Workers / Durable Objects",
      },
      bridge: {
        name: "@pi-financeiro/whatsapp-bridge",
        status: "transitional / staged retirement",
      },
    },
    counts: {
      apiRoutes: uniqueRoutes.length,
      databaseMigrations: migrations.length,
      latestMigration: migrations[migrations.length - 1] || "V030__bridge_phone_identity.sql",
      capabilitiesTotal: 72,
      capabilitiesInApiMode: 51,
    },
    architecture: {
      sourceOfTruth: "Fastify PostgreSQL API (apps/api)",
      primaryClient: "PWA (apps/pwa)",
      assistantEngine: "Cloudflare Agent Worker (apps/agent)",
      canonicalPwaPath: "apps/pwa",
      deprecatedOrigin: "../pi-finance-web",
    },
    production: {
      vpsProvider: "Hostinger VPS",
      edgeProvider: "Cloudflare",
      database: "PostgreSQL 16+",
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const facts = generateRuntimeFacts();
  const outPath = path.join(ROOT, "docs", "architecture", "runtime-facts.json");
  fs.writeFileSync(outPath, JSON.stringify(facts, null, 2) + "\n", "utf8");
  console.log(`Generated runtime facts at ${outPath}`);
}
