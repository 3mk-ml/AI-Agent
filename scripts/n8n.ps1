param(
  [ValidateSet('status','install','start')][string]$Action = 'status',
  [string]$Version = '2.45.4'
)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Install a compatible Node.js LTS version first.' }
Write-Host ('Node: ' + (& node.exe --version))
$n8n = Get-Command n8n.cmd -ErrorAction SilentlyContinue
if ($Action -eq 'status') {
  if ($n8n) { & $n8n.Source --version } else { Write-Host 'n8n is not available on PATH. No download was started.' }
  exit
}
if ($Action -eq 'install') {
  if ($n8n) { Write-Host 'Existing n8n detected. It will not be reinstalled.'; & $n8n.Source --version; exit }
  if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Use a full n8n version number.' }
  Write-Host 'Do not run this while another n8n installation is still in progress.'
  Write-Host 'Installing n8n with cached packages preferred. Missing packages still require internet.'
  & npm.cmd install -g "n8n@$Version" --prefer-offline --no-audit --no-fund --engine-strict
  if ($LASTEXITCODE -ne 0) { throw 'Installation did not complete. Preserve npm cache and inspect the final error.' }
  exit
}
if (-not $n8n) { throw 'n8n is not installed or not on PATH. Run -Action status before deciding to install.' }
$env:N8N_LISTEN_ADDRESS = '127.0.0.1'
$env:N8N_HOST = '127.0.0.1'
$env:N8N_PORT = '5678'
$env:N8N_PROTOCOL = 'http'
$env:N8N_SECURE_COOKIE = 'false'
Write-Host 'Starting loopback-only n8n. Existing n8n user data is preserved. Never tunnel port 5678.'
& $n8n.Source start
