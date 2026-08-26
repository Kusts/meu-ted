# Backup + Restore Runbook

> **G2.1.5** — Backup e restore validados com SHA256 checksum.
> Ferramentas: `scripts/backup-db.mjs` e `scripts/restore-db.mjs`.

## Pré-requisitos

- Docker Desktop (pg_dump/pg_restore não precisam estar instalados localmente)
- `DATABASE_URL` configurada apontando para o banco

## Backup

```bash
# Backup com ID auto-gerado
DATABASE_URL=postgresql://user:pass@host:5432/db node scripts/backup-db.mjs

# Backup com ID customizado (para integrar com migrate-job)
BACKUP_ID=pre-migration-20260730 \
  DATABASE_URL=postgresql://postgres@localhost:5436/pi_source \
  node scripts/backup-db.mjs
```

**Produz:**
- `data/backups/{BACKUP_ID}.dump` — pg_dump formato custom (-Fc), comprimido (-Z9)
- `data/backups/{BACKUP_ID}.dump.sha256` — checksum SHA256 sidecar

**Output:** imprime `BACKUP_ID=...` no final para piping.

## Restore

```bash
# Restaura com validação de checksum (falha se SHA256 não conferir)
DB_TEST_MARKER=true \
DATABASE_URL=postgresql://user:pass@host:5432/target_db \
  node scripts/restore-db.mjs <backup-id>
```

`DB_TEST_MARKER=true` é obrigatório como trava explícita para a operação destrutiva. O restore usa `pg_restore --clean --if-exists` — limpa o schema existente antes de recriar.

## Rehearsal automatizado

O teste `scripts/backup-restore-rehearsal.test.mjs` sobe um PostgreSQL 17 descartável, carrega `scripts/anonymized-dump.sql`, executa backup, recalcula o SHA256, restaura em um banco `target` limpo, compara as contagens (`accounts=3`, `categories=13`, `transactions=16`) e confirma `_test_marker`. Também prova que um dump adulterado é rejeitado antes do restore.

```bash
pnpm test:backup-restore
```

## Ciclo completo (backup → migrate → validação)

```bash
# 1. Backup (exporta o ID para os passos seguintes)
export BACKUP_ID="pre-migration-$(date +%Y%m%d)"
DATABASE_URL="$DATABASE_URL" \
  BACKUP_ID="$BACKUP_ID" \
  node scripts/backup-db.mjs

# 2. Migrate (usa o mesmo BACKUP_ID)
BACKUP_CONFIRMED=true \
  BACKUP_ID="$BACKUP_ID" \
  DB_TEST_MARKER=... \
  DATABASE_URL=$DATABASE_URL \
  npx tsx apps/api/src/scripts/migrate-job.ts

# 3. Validar (opcional: restore em banco de staging para conferir)
DB_TEST_MARKER=true \
DATABASE_URL=postgresql://user:pass@localhost:5432/staging_db \
  node scripts/restore-db.mjs "$BACKUP_ID"
```

## Segurança

- O checksum SHA256 é gerado **após** o pg_dump completo e verificado **antes** do restore.
- O migrate-job.ts já exige `BACKUP_CONFIRMED=true` e `BACKUP_ID` — o backup-db.mjs produz exatamente o `BACKUP_ID` necessário.
- O restore usa `--clean --if-exists` — seguro para restore em banco vazio ou existente.
