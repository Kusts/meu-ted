# Monorepo Dockerfile for meu-ted-api
# Baseline: Node 22 Alpine, pnpm 10 (matching VPS production)
# Build from repo root: docker build -f apps/api/Dockerfile .

FROM node:22-alpine
# CVE-2026-14456 libcrypto3/libssl3 3.5.7-r0 -> 3.5.8-r0: force upgrade on alpine 3.24
RUN apk update && apk upgrade --no-cache libcrypto3 libssl3
RUN npm install -g pnpm@10.34.1
WORKDIR /monorepo

# Copy workspace config and root lockfile
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
# Copy only apps/api package.json for install
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter ./apps/api... --ignore-scripts=false

# Copy API source and build
COPY apps/api apps/api
WORKDIR /monorepo/apps/api
RUN pnpm build

EXPOSE 3001
ENV NODE_ENV=production
ENV MIGRATIONS_MODE=disabled
CMD ["node", "dist/server/index.js"]
