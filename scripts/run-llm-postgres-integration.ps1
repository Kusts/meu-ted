# LLM Postgres integration suites against a disposable postgres:16 container.
# Spins the container on a random host port, creates the test databases,
# exports the DATABASE_URL_TEST_* vars + DB_TEST_MARKER the suites read,
# runs the 4 LLM integration files, then always removes the container.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\run-llm-postgres-integration.ps1
$ErrorActionPreference = 'Stop'

$Container = "llm-it-pg-$PID"
$User = 'synkroo'
$Password = 'change-me-local-dev-password'
# One database per suite: the files TRUNCATE shared tables and the V042 file
# needs a pre-V042 base, so sharing a single DB makes them interfere.
$MainDb = 'llm_it_main'
$FixDb = 'llm_it_fix'
$LegacyDb = 'llm_it_fix_legacy'
$AtomicDb = 'llm_it_atomic'
$V042Db = 'llm_it_v042'

try {
  Write-Host '=== [1/4] Start disposable postgres:16 (random host port) ==='
  docker rm -f $Container 2>$null | Out-Null
  docker run -d --rm --name $Container `
    -e "POSTGRES_USER=$User" -e "POSTGRES_PASSWORD=$Password" -e "POSTGRES_DB=$User" `
    -P postgres:16-alpine | Out-Null

  Write-Host 'Waiting for Postgres...'
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    docker exec $Container pg_isready -U $User -d $User 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 2
  }
  if (-not $ready) { throw 'Postgres did not become ready in time.' }
  $Port = ((docker port $Container 5432 | Select-Object -First 1) -split ':')[-1]
  Write-Host "Postgres ready on 127.0.0.1:$Port."

  Write-Host '=== [2/4] Create one test database per suite ==='
  foreach ($Db in @($MainDb, $FixDb, $LegacyDb, $AtomicDb, $V042Db)) {
    docker exec $Container psql -U $User -d $User -c "CREATE DATABASE $Db;" | Out-Null
  }

  $BaseUrl = "postgresql://${User}:${Password}@127.0.0.1:${Port}"
  $env:DATABASE_URL_TEST = "$BaseUrl/$MainDb"
  $env:DATABASE_URL_TEST_FIX = "$BaseUrl/$FixDb"
  $env:DATABASE_URL_TEST_FIX_LEGACY = "$BaseUrl/$LegacyDb"
  $env:DATABASE_URL_TEST_ATOMIC = "$BaseUrl/$AtomicDb"
  $env:DATABASE_URL_TEST_V042 = "$BaseUrl/$V042Db"
  $env:DB_TEST_MARKER = 'llm-integration'

  Write-Host '=== [3/4] Run the 4 LLM integration suites ==='
  pnpm --filter pi-finance-api exec vitest run --hookTimeout=180000 `
    tests/integration/postgres-llm-fix.test.ts `
    tests/integration/postgres-llm-atomic-guards.test.ts `
    tests/integration/postgres-llm-v042-alignment.test.ts `
    tests/integration/postgres-agent-llm-config.test.ts
  if ($LASTEXITCODE -ne 0) { throw "Integration suites failed (exit $LASTEXITCODE)." }
  Write-Host '=== [4/4] Done ==='
}
finally {
  Write-Host 'Cleanup: removing container...'
  docker rm -f $Container 2>$null | Out-Null
}
