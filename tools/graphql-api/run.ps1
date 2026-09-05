param(
  [int]$Port = 4000,
  [switch]$Live,
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend\app.py"

Write-Host "== APIForge GraphQL Test Backend - runner ==" -ForegroundColor Cyan
Write-Host "Root: $Root"
Write-Host "Backend: $Backend  Port: $Port"

if (-not $SkipInstall) {
  Write-Host "`n[1/3] Installing Python deps..." -ForegroundColor Yellow
  pip install -r (Join-Path $Root "backend\requirements.txt")
  if ($LASTEXITCODE -ne 0) { throw "pip install failed" }
}

Write-Host "`n[2/3] Running pytest in-process..." -ForegroundColor Yellow
Push-Location $Root
try {
  python -m pytest tests -v
  if ($LASTEXITCODE -ne 0) { throw "pytest failed" }
} finally { Pop-Location }

if ($Live) {
  Write-Host "`n[3/3] Live server test fetch over HTTP..." -ForegroundColor Yellow
  $env:LIVE = "1"
  $env:APIFORGE_GRAPHQL_URL = "http://localhost:$Port"

  Write-Host "Starting backend on :$Port ..."
  $job = Start-Job -ScriptBlock {
    param($port, $root)
    $env:PORT = "$port"
    Set-Location $root
    python -m backend.app
  } -ArgumentList $Port, $Root

  $ok = $false
  for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 700
    try {
      $r = Invoke-RestMethod -Uri "http://localhost:$Port/health" -TimeoutSec 5
      if ($r.status -eq "ok") { $ok = $true; break }
    } catch {}
    if ($job.State -ne "Running") {
      $out = Receive-Job $job 2>&1 | Out-String
      Write-Host $out -ForegroundColor Red
      throw "backend job died"
    }
    if ($i -eq 5) { Write-Host "  ... waiting for backend (still starting) ..." -ForegroundColor DarkGray }
  }
  if (-not $ok) {
    $out = Receive-Job $job 2>&1 | Out-String
    Write-Host $out -ForegroundColor Red
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    throw "backend never became healthy at http://localhost:$Port/health"
  }
  Write-Host "Backend healthy at http://localhost:$Port" -ForegroundColor Green

  try {
    $body = @{ query = "query { health { status } }" } | ConvertTo-Json
    $g = Invoke-RestMethod -Uri "http://localhost:$Port/graphql" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 3
    Write-Host "GraphQL health check: $($g.data.health.status)" -ForegroundColor Green
  } catch { Write-Host "GraphQL check warn: $_" -ForegroundColor Yellow }

  try {
    Push-Location $Root
    python -m pytest tests -v --live -k live
  } finally {
    Pop-Location
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    Write-Host "Backend stopped." -ForegroundColor DarkGray
  }
} else {
  Write-Host "`n[3/3] Skip live tests pass -Live to also run fetch tests" -ForegroundColor DarkGray
}

Write-Host "`nAll done." -ForegroundColor Green
Write-Host "Tip: manual scanner test -> launch backend and scan from APIForge UI:"
Write-Host "  `$env:PORT=4000; python -m backend.app  # from tools/graphql-api"
Write-Host "  then in APIForge: Route Scanner -> http://localhost:$Port -> Scan expect graphql"
