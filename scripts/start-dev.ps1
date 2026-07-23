param(
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) {
  $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
}

if (-not $nodeCommand -or -not $npmCommand) {
  throw 'Node.js or npm was not found. Install Node.js 22 LTS and retry.'
}

Write-Host "Node: $(& $nodeCommand.Source --version)"
Write-Host "npm:  $(& $npmCommand.Source --version)"

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
  Write-Host 'First run: installing locked dependencies with npm ci...'
  & $npmCommand.Source ci
  if ($LASTEXITCODE -ne 0) {
    throw "npm ci failed with exit code $LASTEXITCODE"
  }
}

& $nodeCommand.Source (Join-Path $projectRoot 'scripts\restart-dev.mjs')
if ($LASTEXITCODE -ne 0) {
  throw "Development startup failed with exit code $LASTEXITCODE"
}

$webUrl = 'http://127.0.0.1:5174/'
Write-Host "Ready: $webUrl"

if (-not $NoBrowser) {
  Start-Process $webUrl
}
