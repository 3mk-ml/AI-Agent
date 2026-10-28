param([switch]$Production)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Test-Path 'node_modules')) { throw 'Run npm install first. This script does not download dependencies.' }
& node.exe scripts/setup.mjs
if ($LASTEXITCODE -ne 0) { throw 'Local setup failed.' }
$mode = if ($Production) { 'start' } else { 'dev' }
Write-Host 'Use separate terminals for the application, worker, n8n and optional channel listeners.'
Write-Host 'Worker command: npm run worker'
Write-Host 'Telegram command: npm run telegram'
Write-Host 'Slack command: npm run slack'
& npm.cmd run $mode
