FROM debian:12-slim

SHELL ["/bin/bash", "-c"]

# Deps mínimas para instalar e rodar Pi
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    curl \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22 (requerido pelo instalador do Pi) — via binário oficial, não interativo
RUN curl -fsSL https://nodejs.org/dist/v22.19.0/node-v22.19.0-linux-x64.tar.gz | tar -xz -C /usr/local --strip-components=1

# Pi instala em ~/.local/bin por padrão
ENV PI_HOME=/home/pi
ENV HOME=/home/pi
ENV PATH=/home/pi/.local/bin:$PATH

RUN curl -fsSL https://pi.dev/install.sh | sh

# Working dir default
WORKDIR /workspace

CMD ["pi", "--project", "/workspace"]