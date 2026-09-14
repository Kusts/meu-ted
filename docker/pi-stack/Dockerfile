FROM node:22-slim

SHELL ["/bin/bash", "-c"]

# Deps mínimas para Pi (bridge removido em P3 f640e84; ver nota abaixo)
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    curl \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# pnpm (pin to host version to avoid ERR_PNPM_IGNORED_BUILDS)
RUN npm install -g pnpm@10.34.1

# Pi CLI
RUN curl -fsSL https://pi.dev/install.sh | sh

WORKDIR /workspace

# Copia manifests primeiro para aproveitar cache de dependências
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json vitest.config.ts ./
# 2026-09-14: apps/whatsapp-bridge removido em P3 (f640e84); pacote não existe
# mais no repo. Linha de COPY do manifest do bridge desativada — NÃO reativar
# sem restaurar o pacote. Estes arquivos docker/pi-stack NÃO são a topologia
# viva (produção = /opt/pi-stack na VPS com imagens ghcr; PWA/Agent no
# Cloudflare). Remoção total destes arquivos é follow-up recomendado.
# COPY apps/whatsapp-bridge/package.json apps/whatsapp-bridge/package.json

# Instala dependências do workspace dentro da imagem
RUN pnpm install --frozen-lockfile

# Copia o restante do projeto. Runtime não depende de bind mount do host.
COPY . .

# 2026-09-14: comando do bridge desativado (pacote removido em P3 f640e84).
# CMD ["bash", "-lc", "pnpm --filter @pi-financeiro/whatsapp-bridge start"]
