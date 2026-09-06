-- V043 — Better Auth admin + impersonation columns, legacy-safe repair (additive, idempotent).
--
-- MOTIVO: login de producao quebrado — POST /api/backend/auth/login retorna
-- 500 SCHEMA_MISMATCH porque o banco da VPS nao tem as colunas que o plugin
-- admin do better-auth exige. A V031 criou parte delas (user.role/banned/
-- banReason/banExpires + account.issuer) mas ficou FORA de LEGACY_SAFE_PREFIXES,
-- logo nunca rodou na VPS (DB_SCHEMA=legacy aplica no boot somente o que esta
-- na lista). Alem disso, nenhuma migration criou session.impersonatedBy.
--
-- EVIDENCIA (better-auth instalado 1.6.30, cf. apps/api/node_modules/better-auth;
-- lockfile exige ^1.6.26): dist/plugins/admin/schema.mjs declara exatamente
--   user:    role (string), banned (boolean, default false),
--            banReason (string), banExpires (date)
--   session: impersonatedBy (string)
-- O plugin bearer (outro plugin ativo em src/auth/better-auth.ts) nao declara
-- schema proprio — nao exige coluna alguma. O adapter Kysely cita identificadores,
-- portanto os nomes camelCase abaixo sao case-sensitive e precisam das aspas
-- (cf. V019, que renomeou as colunas nativas para "createdAt", "userId", ...).
--
-- REPARO V031 INCLUSO: a V031 escreveu `ADD COLUMN ... banReason/banExpires`
-- SEM aspas, e o Postgres dobra identificadores sem aspas para minusculas —
-- onde a V031 rodou, ela criou `banreason`/`banexpires` (minusculas), que o
-- better-auth NAO enxerga (ele consulta "banReason"/"banExpires"). O bloco DO
-- abaixo renomeia esses restos para o nome citado quando o correto ainda nao
-- existe (preserva dados; os restos sao sempre vazios porque nenhuma escrita
-- com o nome errado foi possivel). Em banco virgem ou VPS o bloco nao faz nada.
--
-- DECISAO LEGACY_SAFE: SIM — V043 ENTRA em LEGACY_SAFE_PREFIXES. E' o ponto
-- central deste fix: sem isso o boot legacy da VPS continua pulando as colunas
-- e o login continua 500. Seguro no modo legacy porque e' puramente aditivo
-- (ADD COLUMN IF NOT EXISTS, sem backfill, sem constraints novas alem de
-- defaults em colunas novas) e toca somente as tabelas modernas user/session/
-- account do better-auth, que ja existem na VPS — nunca nas tabelas financeiras
-- legadas (accounts_payable, budgets, ...).
--
-- SEGURANCA NOS DOIS ESTADOS:
--   - legacy+better-auth (VPS): tabelas user/session/account existem; os ALTERs
--     adicionam o que falta; re-execucao e' no-op (IF NOT EXISTS).
--   - canonico (dev/local, V031 aplicada ou nao): idem; com o reparo do bloco DO
--     quando os restos minusculos da V031 existirem.
-- Se user/session/account NAO existirem (estado inesperado), os ALTERs falham e
-- a migration aborta com rollback antes de registrar _migrations (fail-fast do
-- runner) — comportamento desejado: nunca marcar como aplicada sem aplicar.
--
-- ROLLBACK (runner forward-only, sem down): colunas aditivas sao seguras para
-- permanecer; para reverter, DROP COLUMN IF EXISTS "impersonatedBy" etc.
-- manualmente apos voltar o codigo. Nunca reverta schema com codigo novo no ar.

-- (1) Reparo do case-folding da V031: renomeia restos minusculos para o nome
-- citado que o better-auth consulta. No-op quando nao ha' o que reparar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'user' AND column_name = 'banreason')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'user' AND column_name = 'banReason') THEN
    ALTER TABLE "user" RENAME COLUMN banreason TO "banReason";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'user' AND column_name = 'banexpires')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'user' AND column_name = 'banExpires') THEN
    ALTER TABLE "user" RENAME COLUMN banexpires TO "banExpires";
  END IF;
END $$;

-- (2) Colunas do plugin admin em "user" (tipos alinhados a V031 e ao schema do
-- plugin: role string, banned boolean default false, banReason string nula,
-- banExpires date nula). Aspas obrigatorias nos camelCase (case-sensitive).
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS "banned" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "banReason" TEXT,
  ADD COLUMN IF NOT EXISTS "banExpires" TIMESTAMPTZ;

-- (3) Coluna de impersonacao do plugin admin em session (string opcional).
ALTER TABLE session
  ADD COLUMN IF NOT EXISTS "impersonatedBy" TEXT;

-- (4) Linha de credencial em account (reafirma V031 para a VPS que nunca a rodou).
ALTER TABLE account
  ADD COLUMN IF NOT EXISTS issuer TEXT;
