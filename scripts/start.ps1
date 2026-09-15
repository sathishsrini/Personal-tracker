<#
.SYNOPSIS
  Frees the target port (killing whatever's listening on it) and starts the app.

.EXAMPLE
  ./scripts/start.ps1
  Kill anything on port 3000, then `npm run dev`.

.EXAMPLE
  ./scripts/start.ps1 -Port 3001 -Mode start
  Kill anything on port 3001, build, then `npm run start` (production) on it.

.EXAMPLE
  ./scripts/start.ps1 -Storage local
  Force the local JSON-file storage driver for this run, regardless of .env.
#>
param(
    [int]$Port = 3000,
    [ValidateSet("dev", "start")]
    [string]$Mode = "dev",
    [ValidateSet("", "local", "sheets")]
    [string]$Storage = ""
)

$ErrorActionPreference = "Stop"

function Free-Port([int]$Port) {
    Write-Host "Checking for a process on port $Port..." -ForegroundColor Cyan
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) {
        Write-Host "Port $Port is free." -ForegroundColor Green
        return
    }
    $procIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $procIds) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        $name = if ($proc) { $proc.ProcessName } else { "pid $procId" }
        Write-Host "Killing $name (pid $procId) on port $Port" -ForegroundColor Yellow
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
        } catch {
            Write-Warning "Could not stop pid $procId : $_"
        }
    }
    # Give Windows a moment to actually release the socket before we bind to it again.
    Start-Sleep -Milliseconds 700
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot
try {
    Free-Port -Port $Port

    if ($Storage -ne "") {
        $env:STORAGE_DRIVER = $Storage
        Write-Host "STORAGE_DRIVER=$Storage (this run only)" -ForegroundColor DarkGray
    }

    if ($Mode -eq "start") {
        Write-Host "Building..." -ForegroundColor Cyan
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Build failed with exit code $LASTEXITCODE" }
        Write-Host "Starting production server on port $Port..." -ForegroundColor Cyan
        npm run start -- -p $Port
    } else {
        Write-Host "Starting dev server on port $Port..." -ForegroundColor Cyan
        npm run dev -- -p $Port
    }
} finally {
    Pop-Location
}
