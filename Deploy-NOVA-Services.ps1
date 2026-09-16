param([switch]$Deploy)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$serviceDir = Join-Path $root 'services\rendezvous'
Set-Location $serviceDir

Write-Host 'Checking Cloudflare account authorization...' -ForegroundColor Cyan
npx.cmd --yes wrangler@4.132.0 whoami
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Opening Cloudflare authorization in your browser...' -ForegroundColor Yellow
  npx.cmd --yes wrangler@4.132.0 login
  if ($LASTEXITCODE -ne 0) { throw 'Cloudflare authorization was not completed.' }
}

node (Join-Path $root 'scripts\test-service.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Online-service tests failed.' }
npx.cmd --yes wrangler@4.132.0 deploy --dry-run
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare Worker dry-run failed.' }

if ($Deploy) {
  Write-Host 'Deploying NOVA online services...' -ForegroundColor Cyan
  $deployLines = @(& npx.cmd --yes wrangler@4.132.0 deploy 2>&1)
  $exit = $LASTEXITCODE
  $deployLines | ForEach-Object { Write-Host $_ }
  if ($exit -ne 0) { throw 'Cloudflare deployment failed.' }

  $joined = $deployLines -join "`n"
  $match = [regex]::Match($joined, 'https://[A-Za-z0-9.-]+\.workers\.dev')
  if ($match.Success) {
    $origin = $match.Value.TrimEnd('/')
    $signingDir = Join-Path $env:USERPROFILE '.nova-signing'
    New-Item -ItemType Directory -Force -Path $signingDir | Out-Null
    Set-Content -Encoding utf8 -NoNewline -Path (Join-Path $signingDir 'service-url.txt') -Value $origin
    Write-Host "Saved NOVA service origin: $origin" -ForegroundColor Green
    & (Join-Path $root 'scripts\Test-NOVA-Service.ps1') -ServiceUrl $origin
  } else {
    Write-Host 'Worker deployed, but its workers.dev URL could not be parsed automatically.' -ForegroundColor Yellow
    Write-Host 'Copy the https://...workers.dev URL printed above into %USERPROFILE%\.nova-signing\service-url.txt.' -ForegroundColor Yellow
  }
  Write-Host ''
  Write-Host 'Next: configure Google OAuth exactly once using services\rendezvous\README.md, then run this command again.' -ForegroundColor Yellow
} else {
  Write-Host 'Dry-run passed. Re-run with -Deploy when the Cloudflare account is ready.' -ForegroundColor Green
}
