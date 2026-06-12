FROM node:22-slim

SHELL ["/bin/bash", "-c"]

# Deps mínimas para Pi + bridge
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    curl \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# pnpm (pin to host version to avoid ERR_PNPM_IGNORED_BUILDS)
RUN npm install -g pnpm@10.34.1

# Pi CLI (instala em ~/.local/bin)
RUN curl -fsSL https://pi.dev/install.sh | sh

WORKDIR /workspace

# O projeto é montado no compose — deps instaladas pelo pnpm/npm do host
CMD ["bash"]
