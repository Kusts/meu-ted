# Monorepo Dockerfile for meu-ted-api
# Baseline: Node 22 Alpine, pnpm 10 (matching VPS production)
# Build from repo root: docker build -f apps/api/Dockerfile .

FROM node:22-alpine AS builder
# CVE-2026-14456 libcrypto3/libssl3 3.5.7-r0 -> 3.5.8-r0: force upgrade on alpine 3.24
RUN apk update && apk upgrade --no-cache libcrypto3 libssl3
RUN npm install -g pnpm@10.34.1
WORKDIR /monorepo

# Copy workspace config and root lockfile
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
# Workspace package manifests are required for workspace:* resolution.
COPY packages packages
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts=false

# Copy API source and build
COPY apps/api apps/api
RUN pnpm --filter @pi-finance/llm-contracts build
WORKDIR /monorepo/apps/api
RUN pnpm build

FROM node:22-alpine AS runner

RUN apk update && apk upgrade --no-cache libcrypto3 libssl3
RUN addgroup -g 10001 -S appgroup && adduser -u 10001 -S appuser -G appgroup
WORKDIR /monorepo/apps/api

COPY --from=builder /monorepo/node_modules /monorepo/node_modules
COPY --from=builder /monorepo/packages /monorepo/packages
COPY --from=builder /monorepo/apps/api/package.json ./package.json
COPY --from=builder /monorepo/apps/api/node_modules ./node_modules
COPY --from=builder /monorepo/apps/api/dist ./dist

USER appuser:appgroup

EXPOSE 3001
ENV NODE_ENV=production
ENV MIGRATIONS_MODE=disabled
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget --spider --quiet http://127.0.0.1:3001/health || exit 1
CMD ["node", "dist/server/index.js"]
