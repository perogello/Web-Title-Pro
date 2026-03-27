$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

function Get-LanIPv4Addresses {
  $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      (
        $_.IPAddress -like '10.*' -or
        $_.IPAddress -like '192.168.*' -or
        $_.IPAddress -match '^172\.(1[6-9]|2[0-9]|3[0-1])\.'
      )
    } |
    Select-Object -ExpandProperty IPAddress -Unique

  if (-not $addresses) {
    $addresses = @()
  }

  return $addresses
}

Write-Host ''
Write-Host 'Web Title Pro launcher' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path '.\node_modules')) {
  Write-Host 'node_modules not found, running npm install...' -ForegroundColor Yellow
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) {
    throw 'npm install failed.'
  }
}

$lanAddresses = Get-LanIPv4Addresses

Write-Host 'Control Panel:' -ForegroundColor Green
Write-Host '  http://127.0.0.1:4000'
Write-Host '  http://localhost:4000'
Write-Host ''
Write-Host 'Renderer URL for vMix / OBS:' -ForegroundColor Green
Write-Host '  http://127.0.0.1:4000/render.html'
Write-Host '  http://localhost:4000/render.html'

foreach ($ip in $lanAddresses) {
  Write-Host "  http://${ip}:4000/render.html"
}

Write-Host ''
Write-Host 'Preview URL:' -ForegroundColor Green
Write-Host '  http://127.0.0.1:4000/render.html?preview=1'

foreach ($ip in $lanAddresses) {
  Write-Host "  http://${ip}:4000/render.html?preview=1"
}

Write-Host ''
Write-Host 'Launching desktop window...' -ForegroundColor Cyan
Write-Host ''

try {
  & npm.cmd run desktop
} catch {
  Write-Host ''
  Write-Host 'Desktop shell failed, opening web control panel in browser...' -ForegroundColor Yellow
  Start-Process 'http://127.0.0.1:4000'
  exit 0
}

if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host 'Desktop shell failed, opening web control panel in browser...' -ForegroundColor Yellow
  Start-Process 'http://127.0.0.1:4000'
  exit 0
}
