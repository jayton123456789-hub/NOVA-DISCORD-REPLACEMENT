$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
Write-Host 'Building the shareable NOVA installer...' -ForegroundColor Cyan
npm.cmd install
npm.cmd run tauri build
Write-Host ''
Write-Host 'Build complete. Installer output:' -ForegroundColor Green
Write-Host (Join-Path $PSScriptRoot 'src-tauri\target\release\bundle') -ForegroundColor Yellow
explorer.exe (Join-Path $PSScriptRoot 'src-tauri\target\release\bundle')
