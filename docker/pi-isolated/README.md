# Pi Isolado em Docker

Container Docker com Pi limpo, HOME isolado do host (`~/.claude` global).
O repo é montado em `/workspace`; o HOME do Pi (`/home/pi`) persiste num volume nomeado.

**Não monta `~/.claude` ou `~/.pi` do host.**

## Uso

```bash
# 1. Build da imagem
docker compose -f docker/pi-isolated/docker-compose.yml build

# 2. Start em background
docker compose -f docker/pi-isolated/docker-compose.yml up -d

# 3. Abrir Pi (repo já montado em /workspace)
docker compose -f docker/pi-isolated/docker-compose.yml exec pi pi

# Opcional: shell bash no container
docker compose -f docker/pi-isolated/docker-compose.yml exec pi bash
```

## Variáveis de ambiente

**Opção A — via `environment:` no compose** (persistente):

Edite `environment:` no `docker-compose.yml`:

```yaml
environment:
  - HOME=/home/pi
  - OPENAI_API_KEY=sk-...
  - PI_API_TOKEN=...
```

**Opção B — via `--env-file`:**

```bash
echo "OPENAI_API_KEY=sk-..." > .env.pi
docker compose -f docker/pi-isolated/docker-compose.yml --env-file .env.pi up -d
```

**Opção C — via `-e` no exec:**

```bash
docker compose -f docker/pi-isolated/docker-compose.yml exec -e OPENAI_API_KEY=sk-... pi pi --project /workspace
```

## Parar / Limpar

```bash
# Parar e remover container
docker compose -f docker/pi-isolated/docker-compose.yml down

# Remover também o volume (apaga configs/auth do Pi no container)
docker compose -f docker/pi-isolated/docker-compose.yml down -v
```