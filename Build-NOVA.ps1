$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
$serviceFile = Join-Path $env:USERPROFILE '.nova-signing/service-url.txt'
if (!$env:VITE_NOVA_SERVICE_URL) {
  if ($env:NOVA_SERVICE_URL) { $env:VITE_NOVA_SERVICE_URL = $env:NOVA_SERVICE_URL.Trim() }
  elseif (Test-Path $serviceFile) { $env:VITE_NOVA_SERVICE_URL = (Get-Content $serviceFile -Raw).Trim() }
}
if (!$env:VITE_NOVA_SERVICE_URL) { throw 'NOVA online service URL is required for a shareable build. Deploy services once, then save the Worker origin in .nova-signing/service-url.txt.' }
if ($env:VITE_NOVA_SERVICE_URL -notmatch '^https://') { throw 'Production NOVA service URL must use HTTPS.' }
& (Join-Path $PSScriptRoot 'scripts\Test-NOVA-Service.ps1') -ServiceUrl $env:VITE_NOVA_SERVICE_URL -RequireGoogle
Write-Host 'Building the shareable NOVA installer...' -ForegroundColor Cyan
npm.cmd ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node scripts/test-service.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx.cmd --yes wrangler@4.132.0 deploy --dry-run --config services/rendezvous/wrangler.jsonc
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare Worker dry-run failed' }
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run tauri build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host ''
Write-Host 'Build complete. Installer output:' -ForegroundColor Green
Write-Host (Join-Path $PSScriptRoot 'src-tauri\target\release\bundle') -ForegroundColor Yellow
explorer.exe (Join-Path $PSScriptRoot 'src-tauri\target\release\bundle')
