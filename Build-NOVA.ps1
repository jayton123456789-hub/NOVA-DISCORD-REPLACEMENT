$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
Write-Host 'Building the shareable NOVA installer...' -ForegroundColor Cyan
npm.cmd ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run tauri build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host ''
Write-Host 'Build complete. Installer output:' -ForegroundColor Green
Write-Host (Join-Path $PSScriptRoot 'src-tauri\target\release\bundle') -ForegroundColor Yellow
explorer.exe (Join-Path $PSScriptRoot 'src-tauri\target\release\bundle')
