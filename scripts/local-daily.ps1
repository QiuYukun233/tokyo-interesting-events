# Daily crawl from a machine in Japan.
#
# Why: some sources refuse GitHub's runner IPs but serve the same request from
# a Japanese connection (CoRich, sportsentry, JR-Cross; measured 2026-11-15).
# CI skips those (`japanOnly` in scripts/sources/index.mjs); this script runs
# the FULL pipeline here, so they get fetched and committed. We do not proxy
# around anyone's block -- this is simply where we are.
#
# It works in its own disposable clone ($WorkDir), never in the repository you
# edit: the clone is hard-reset to origin/main on every run. Do not edit it.
#
# Schedule (once, from an ordinary PowerShell):
#   schtasks /Create /TN "TokyoEventsLocalDaily" /SC DAILY /ST 14:00 /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"<repo>\scripts\local-daily.ps1\""
# 14:00 JST keeps clear of the CI run (scheduled 07:10, usually lands 10-11).

param(
  [string]$WorkDir = (Join-Path $env:LOCALAPPDATA 'tokyo-events-crawl'),
  [string]$EnvFile = (Join-Path (Split-Path $PSScriptRoot -Parent) '.env.local'),
  [string]$Remote = 'https://github.com/QiuYukun233/tokyo-interesting-events.git'
)

$ErrorActionPreference = 'Stop'
$logDir = Join-Path (Split-Path $WorkDir -Parent) 'tokyo-events-crawl-logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir ((Get-Date -Format 'yyyy-MM-dd') + '.log')) -Append | Out-Null

function Step([string]$name, [scriptblock]$command) {
  Write-Host "== $name"
  & $command
  if ($LASTEXITCODE -ne 0) { throw "$name failed (exit $LASTEXITCODE)" }
}

try {
  if (-not (Test-Path (Join-Path $WorkDir '.git'))) {
    Step 'clone' { git clone $Remote $WorkDir }
  }
  Set-Location $WorkDir
  Step 'fetch' { git fetch origin main }
  Step 'reset to origin/main' { git reset --hard origin/main }
  git config user.name 'tokyo-events-local'
  git config user.email 'actions@users.noreply.github.com'

  # node_modules only when the lockfile changed since the last install.
  $lockHash = (Get-FileHash package-lock.json).Hash
  $stamp = Join-Path $WorkDir 'node_modules\.lock-hash'
  if (-not (Test-Path $stamp) -or (Get-Content $stamp) -ne $lockHash) {
    Step 'npm ci' { npm ci }
    Set-Content -Path $stamp -Value $lockHash
  }
  # DeepSeek (tagging) and Turso credentials; gitignored, so copied each run.
  if (Test-Path $EnvFile) { Copy-Item $EnvFile (Join-Path $WorkDir '.env.local') -Force }

  Step 'test' { npm test }
  Step 'update-events (all sources, incl. Japan-only)' { npm run update-events }
  Step 'collect-shop-changes' { npm run collect-shop-changes }
  Step 'apply-gate' { npm run apply-gate }
  if (Test-Path (Join-Path $WorkDir '.env.local')) { Step 'tag-candidates' { npm run tag-candidates } }
  Step 'export-site' { npm run export-site }
  Step 'build' { npm run build }

  git add data/events.json data/backstage.json data/review-events.json data/source-registry.json data/pool.db
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    Step 'commit' { git commit -m 'data: refresh Tokyo events (local, incl. Japan-only sources)' }
    # A rejected push means CI committed in between; pool.db is binary and does
    # not merge, so drop this run -- tomorrow's starts from the new head.
    Step 'push' { git push origin HEAD:main }
  } else {
    Write-Host 'No data changes.'
  }

  # Mirror to Turso from here as well: GitHub has no Turso secrets. Non-fatal.
  # push-cloud reads process env only, so lift just the TURSO_* lines in
  # (process scope; nothing is written to the user's environment).
  if (Test-Path $EnvFile) {
    foreach ($line in Get-Content $EnvFile) {
      if ($line -match '^(TURSO_[A-Z_]+)=(.*)$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2].Trim('"', "'") }
    }
  }
  npm run push-cloud
  if ($LASTEXITCODE -ne 0) { Write-Warning "push-cloud failed (exit $LASTEXITCODE); check TURSO_* in .env.local" }
  npm run check-sources
} catch {
  Write-Host "FAILED: $_"
  exit 1
} finally {
  Stop-Transcript | Out-Null
}
