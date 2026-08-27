FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile=false

COPY src/ ./src/
RUN pnpm build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3005

RUN addgroup -g 10001 -S appgroup && \
    adduser -u 10001 -S appuser -G appgroup && \
    mkdir -p /var/lib/codex-auth && \
    chown -R appuser:appgroup /var/lib/codex-auth && \
    chmod 700 /var/lib/codex-auth

USER appuser:appgroup

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src

EXPOSE 3005

CMD ["node", "src/server.js"]
