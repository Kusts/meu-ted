# Migration drift baseline (deploy)

**Data:** 2026-09-07
**Contexto:** o boot do release `b898d6a` no VPS recusou com
`migration drift detected` (guard M-06, `migrate.ts`). Rollback executado,
serviço estável no release `11172e0`. Este documento registra as duas
classes encontradas, a política adotada e o caminho de reconciliação.

## Classe 1 — armazenamento BYTEA legado (V040/V041)

Em parte do histórico, `_migrations.checksum` foi gravada como `BYTEA`
em vez de `TEXT`. O driver retorna bytea como string hexadecimal `\x...`,
que nunca iguala o hex textual do manifesto — mesmo com conteúdo idêntico.
Decodificado, o V041 aplicado **é exatamente** o manifesto (falso
positivo); o V040 decodificado **diverge de verdade** (drift real,
pré-guard).

Correção: `normalizeStoredChecksum` remove o prefixo `\x` de bytea
hexadecimal válido antes de comparar. Iguais passam; diferentes seguem
para a regra de era abaixo.

## Classe 2 — edições legítimas pré-guard (V003/V008–V012)

Os arquivos V003 e V008–V012 foram editados em releases passados **depois**
de já aplicados em produção — histórico legítimo anterior à existência do
guard. Os checksums aplicados divergem dos atuais de forma genuína, mas
não indicam adulteração: indicam evolução sem guarda.

Correção: `MIGRATION_DRIFT_BASELINE_VERSION = 44`. Drift real de checksum
em versões **< V044** vira WARN estruturado
(`event: migration.baseline_drift`, com versão, checksums e orientação) e
**não recusa boot**. Drift em **V044+** (era guardada) continua
fail-closed e aborta startup antes de aplicar qualquer coisa. Divergência
de **nome de arquivo** continua fail-closed em qualquer era (renomear
muda a identidade do manifesto e não pode ser perdoado sozinho).

## Política (resumo)

| Caso | Comportamento |
|---|---|
| bytea `\x...` que decodifica igual ao manifesto | sem drift, boot segue |
| checksum real divergente, versão < V044 | WARN `migration.baseline_drift`, boot segue |
| checksum real divergente, versão ≥ V044 | erro `migration drift detected`, boot recusa |
| nome de arquivo divergente, qualquer versão | erro, boot recusa |
| checksum vazio (linha pré-checksum) | backfill silencioso (inalterado) |

## Reconciliação futura (fora do escopo hoje)

Após auditoria semântica que confirme que o conteúdo aplicado em produção
para V003/V008–V012/V040 equivale ao dos arquivos atuais (ou registre as
diferenças aceitas), fazer re-backfill dos checksums:

```sql
-- Somente após a auditoria acima, com backup confirmado (BACKUP_ID):
UPDATE _migrations SET checksum = '<sha256 do arquivo atual>' WHERE version IN (3, 8, 9, 10, 11, 12, 40);
```

Isso silencia os WARNs sem tocar na política. Não automatizar: o WARN
existe para manter a divergência visível até a auditoria acontecer.
Monitorar os WARNs `migration.baseline_drift` nos logs de boot do VPS —
qualquer versão ≥ V044 ali (impossível pelo código atual) indicaria
regressão do guard e deve bloquear o próximo release.
