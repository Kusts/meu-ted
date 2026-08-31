@echo off
REM G0.4.6 Migration Rehearsal — Windows batch (CI-able)
REM
REM Usage:
REM   scripts\rehearse-migration.bat
REM
REM Prerequisites: Docker Desktop, Node 20+, git bash or WSL for sed.
REM
REM Steps:
REM   1. Start disposable Postgres 17 container
REM   2. Load anonymized production snapshot
REM   3. Run migrate-job.ts (G0.4.6) in legacy mode
REM   4. Print migration results
REM   5. Stop and remove container
REM
REM Exit code: 0 = success, 1 = failure.

setlocal enabledelayedexpansion
set "CONTAINER=pi-finance-rehearse"
set "DUMP=%~dp0anonymized-dump.sql"
set "MARKER=pi-finance-migration-rehearsal-2026-07-30"
set "BACKUP_ID=rehearse-%DATE:/=-%-%TIME::=-%"
set "BACKUP_ID=!BACKUP_ID: =!"

echo.
echo === [1/5] Cleanup leftover ===
docker rm -f %CONTAINER% 2>nul

echo.
echo === [2/5] Start disposable Postgres 17 ===
docker run -d --name %CONTAINER% -e POSTGRES_PASSWORD=rehearse -e POSTGRES_DB=pi_rehearsal -p 5435:5432 postgres:17-alpine
if %ERRORLEVEL% neq 0 exit /b 1

echo Waiting for Postgres...
:waitloop
docker exec %CONTAINER% pg_isready -U postgres >nul 2>&1
if %ERRORLEVEL% neq 0 (
  timeout /t 2 /nobreak >nul
  goto waitloop
)
echo Postgres ready.

REM Configure trust auth using WSL or Git Bash sed
echo.
echo === [3/5] Configure trust auth ===
docker exec %CONTAINER% sh -c "sed -i 's|host all all all scram-sha-256|host all all 0.0.0.0/0 trust|' /var/lib/postgresql/data/pg_hba.conf"
docker exec -u postgres %CONTAINER% pg_ctl reload

echo.
echo === [4/5] Load anonymized dump ===
docker exec -i %CONTAINER% psql -U postgres -d pi_rehearsal < "%DUMP%"
if %ERRORLEVEL% neq 0 (
  echo FATAL: dump load failed
  docker rm -f %CONTAINER% >nul
  exit /b 1
)

REM Verify dump loaded
docker exec %CONTAINER% psql -U postgres -d pi_rehearsal -tA -c "SELECT COUNT(*) || ' rows in _test_marker' FROM _test_marker"

echo.
echo === [5/5] Run G0.4.6 migrator ===
docker run --rm --network host ^
  -v "%CD%://workspace" ^
  -w //workspace/apps/api ^
  -e DATABASE_URL=postgresql://postgres@localhost:5435/pi_rehearsal?sslmode=disable ^
  -e DB_TEST_MARKER=%MARKER% ^
  -e BACKUP_CONFIRMED=true ^
  -e BACKUP_ID=%BACKUP_ID% ^
  -e DB_SCHEMA=legacy ^
  node:22-alpine ^
  sh -c "npm install pg typescript tsx 2>/dev/null && npx tsx src/scripts/migrate-job.ts"

set "MIGRATE_EXIT=%ERRORLEVEL%"

REM Verify migrations recorded
echo.
echo === Verification: _migrations ===
docker exec %CONTAINER% psql -U postgres -d pi_rehearsal -c "SELECT version, name FROM _migrations ORDER BY version"

echo.
echo === Verification: backup marker ===
docker exec %CONTAINER% psql -U postgres -d pi_rehearsal -c "SELECT backup_id, ran_at FROM _migration_backup_marker"

echo.
echo === Cleanup ===
docker rm -f %CONTAINER% >nul

if %MIGRATE_EXIT% equ 0 (
  echo.
  echo ✓ Rehearsal complete. All gates green.
) else (
  echo.
  echo ✗ Rehearsal FAILED. See output above.
)
exit /b %MIGRATE_EXIT%
