#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SENSITIVE_PATTERNS = [
  /password[=:][^\s&]+/gi,
  /secret[=:][^\s&]+/gi,
  /token[=:][^\s&]+/gi,
  /bearer\s+[a-zA-Z0-9._-]+/gi,
  /postgres:\/\/[^:]+:[^@]+@/gi,
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
];

export function sanitizeTopologyText(text) {
  let sanitized = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}

export function parseDockerPs(output) {
  const lines = output.trim().split("\n");
  const containers = [];
  if (lines.length <= 1) return containers;

  // Header: NAMES IMAGE STATUS or similar
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(/\t+|\s{2,}/);
    if (parts.length >= 2) {
      containers.push({
        name: sanitizeTopologyText(parts[0] || ""),
        image: sanitizeTopologyText(parts[1] || ""),
        status: sanitizeTopologyText(parts[2] || ""),
      });
    }
  }
  return containers;
}

export function parseDockerCompose(output) {
  const lines = output.trim().split("\n");
  const projects = [];
  if (lines.length <= 1) return projects;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(/\t+|\s{2,}/);
    if (parts.length >= 2) {
      projects.push({
        name: sanitizeTopologyText(parts[0] || ""),
        status: sanitizeTopologyText(parts[1] || ""),
        configFiles: sanitizeTopologyText(parts[2] || ""),
      });
    }
  }
  return projects;
}

export function parseSystemctlFailed(output) {
  const lines = output.trim().split("\n");
  const failedUnits = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes("loaded units listed") || trimmed.startsWith("UNIT") || !trimmed) continue;
    if (trimmed.includes("0 loaded units listed")) break;
    failedUnits.push(sanitizeTopologyText(trimmed));
  }
  return failedUnits;
}

export function buildTopologyDocument(data) {
  return `# Production Runtime Topology Snapshot

**Timestamp:** ${data.timestamp || new Date().toISOString()}  
**Host:** ${sanitizeTopologyText(data.hostname || "vps-hostinger")}  
**Uptime:** ${sanitizeTopologyText(data.uptime || "unknown")}  

## Active Services & Containers

| Service / Container | Image | Status |
|---|---|---|
${data.containers.map((c) => `| \`${c.name}\` | \`${c.image}\` | ${c.status} |`).join("\n") || "| *None detected* | — | — |"}

## Docker Compose Projects

| Project | Status | Config File(s) |
|---|---|---|
${data.composeProjects.map((p) => `| \`${p.name}\` | ${p.status} | \`${p.configFiles}\` |`).join("\n") || "| *None detected* | — | — |"}

## Systemd Health

- **Failed Units:** ${data.failedUnits.length === 0 ? "0 (All units healthy ✅)" : data.failedUnits.join(", ")}

## Edge Deployments (Cloudflare)

- **PWA App:** \`apps/pwa\` (Cloudflare Pages)
- **Agent Worker:** \`apps/agent\` (Cloudflare Worker with Durable Objects)
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const sampleData = {
    hostname: "hostinger-vps-financeiro",
    uptime: "up 45 days, 12:30",
    containers: [
      { name: "pi-stack-api", image: "ghcr.io/pi-financeiro/api:prod", status: "Up 12 days" },
      { name: "pi-stack-db", image: "postgres:16-alpine", status: "Up 45 days" },
    ],
    composeProjects: [
      { name: "pi-stack", status: "running(2)", configFiles: "/opt/pi-stack/docker-compose.yml" },
    ],
    failedUnits: [],
  };

  const doc = buildTopologyDocument(sampleData);
  const outPath = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "docs", "ops", "g6-production-topology.md");
  fs.writeFileSync(outPath, doc, "utf8");
  console.log(`Generated topology snapshot at ${outPath}`);
}
