FROM node:22-alpine AS builder

RUN npm install -g pnpm@10.34.1
WORKDIR /monorepo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/codex-broker/package.json apps/codex-broker/package.json
RUN pnpm install --frozen-lockfile --filter pi-finance-codex-broker...

COPY apps/codex-broker/tsconfig.json apps/codex-broker/tsconfig.build.json apps/codex-broker/
COPY apps/codex-broker/src/ apps/codex-broker/src/
WORKDIR /monorepo/apps/codex-broker
RUN pnpm build
RUN pnpm deploy --legacy --filter pi-finance-codex-broker --prod /runtime

FROM node:22-alpine AS runner

WORKDIR /monorepo/apps/codex-broker
ENV NODE_ENV=production
ENV PORT=3005

RUN addgroup -g 10001 -S appgroup && \
    adduser -u 10001 -S appuser -G appgroup && \
    mkdir -p /var/lib/codex-auth && \
    chown -R appuser:appgroup /var/lib/codex-auth && \
    chmod 700 /var/lib/codex-auth

USER appuser:appgroup

COPY --from=builder /runtime/package.json ./package.json
COPY --from=builder /runtime/node_modules ./node_modules
COPY --from=builder /monorepo/apps/codex-broker/dist ./dist

EXPOSE 3005
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget --spider --quiet http://127.0.0.1:3005/health || exit 1

CMD ["node", "dist/server.js"]
