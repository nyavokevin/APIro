param(
  [int]$Port = 3000,
  [switch]$Live,
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend\apiforge_test_backend.py"

Write-Host "== APIForge Test Backend — runner ==" -ForegroundColor Cyan
Write-Host "Root: $Root"
Write-Host "Backend: $Backend  Port: $Port"

if (-not $SkipInstall) {
  Write-Host "`n[1/3] Installing Python deps..." -ForegroundColor Yellow
  pip install -r (Join-Path $Root "backend\requirements.txt")
  if ($LASTEXITCODE -ne 0) { throw "pip install failed" }
}

Write-Host "`n[2/3] Running pytest (in-process)..." -ForegroundColor Yellow
Push-Location $Root
try {
  pytest tests/test_scanner.py tests/test_api_features.py -v
  if ($LASTEXITCODE -ne 0) { throw "pytest failed" }
} finally { Pop-Location }

if ($Live) {
  Write-Host "`n[3/3] Live server test (fetch over HTTP)..." -ForegroundColor Yellow
  $env:LIVE = "1"
  $env:APIFORGE_TEST_URL = "http://localhost:$Port"

  # Start backend in background job
  Write-Host "Starting backend on :$Port ..."
  $job = Start-Job -ScriptBlock {
    param($py, $port)
    python $py
  } -ArgumentList $Backend, $Port

  # Wait for /health
  $ok = $false
  for ($i=0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 600
    try {
      $r = Invoke-RestMethod -Uri "http://localhost:$Port/health" -TimeoutSec 2
      if ($r.status -eq "ok") { $ok = $true; break }
    } catch {}
    if ($job.State -ne "Running") {
      Receive-Job $job
      throw "backend job died"
    }
  }
  if (-not $ok) {
    Receive-Job $job
    Stop-Job $job -ErrorAction SilentlyContinue
    throw "backend never became healthy"
  }
  Write-Host "Backend healthy at http://localhost:$Port" -ForegroundColor Green

  try {
    Push-Location $Root
    pytest tests/test_scanner.py -v --live -k live
  } finally {
    Pop-Location
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    Write-Host "Backend stopped." -ForegroundColor DarkGray
  }
} else {
  Write-Host "`n[3/3] Skip live tests (pass -Live to also run fetch tests)" -ForegroundColor DarkGray
}

Write-Host "`nAll done." -ForegroundColor Green
Write-Host "Tip: manual scanner test → launch backend in one shell and scan from APIForge UI:"
Write-Host "  python backend/apiforge_test_backend.py"
Write-Host "  then in APIForge: Route Scanner → http://localhost:$Port → Scan"
