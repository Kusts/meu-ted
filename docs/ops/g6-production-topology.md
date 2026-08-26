# Production Runtime Topology Snapshot

**Timestamp:** 2026-08-18T17:13:47.130Z  
**Host:** hostinger-vps-financeiro  
**Uptime:** up 45 days, 12:30  

## Active Services & Containers

| Service / Container | Image | Status |
|---|---|---|
| `pi-stack-api` | `ghcr.io/pi-financeiro/api:prod` | Up 12 days |
| `pi-stack-db` | `postgres:16-alpine` | Up 45 days |

## Docker Compose Projects

| Project | Status | Config File(s) |
|---|---|---|
| `pi-stack` | running(2) | `/opt/pi-stack/docker-compose.yml` |

## Systemd Health

- **Failed Units:** 0 (All units healthy ✅)

## Edge Deployments (Cloudflare)

- **PWA App:** `apps/pwa` (Cloudflare Pages)
- **Agent Worker:** `apps/agent` (Cloudflare Worker with Durable Objects)
