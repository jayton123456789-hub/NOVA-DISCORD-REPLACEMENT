param([switch]$SkipPrerequisites,[switch]$InstallOnly)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
function Refresh-Path{$machine=[Environment]::GetEnvironmentVariable('Path','Machine');$user=[Environment]::GetEnvironmentVariable('Path','User');$env:Path="$machine;$user"}
Write-Host '';Write-Host 'NOVA // VERSION 1 SETUP' -ForegroundColor Cyan;Write-Host 'Lean social client + embedded host + voice/video/screen share' -ForegroundColor DarkGray;Write-Host ''
if(-not $SkipPrerequisites){
 if(-not(Get-Command winget -ErrorAction SilentlyContinue)){throw 'winget is required for automatic setup.'}
 if(-not(Get-Command node -ErrorAction SilentlyContinue)){winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements;Refresh-Path}else{Write-Host "Node: $(node -v)" -ForegroundColor Green}
 if(-not(Get-Command cargo -ErrorAction SilentlyContinue)){winget install --id Rustlang.Rustup -e --accept-package-agreements --accept-source-agreements;Refresh-Path}else{Write-Host "Rust: $(rustc --version)" -ForegroundColor Green}
 if(Get-Command rustup -ErrorAction SilentlyContinue){rustup default stable-msvc|Out-Host}
 $vswhere="${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe";$hasVC=$false;if(Test-Path $vswhere){$vc=& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath;if($vc){$hasVC=$true}}
 if(-not $hasVC){winget install --id Microsoft.VisualStudio.2022.BuildTools -e --accept-package-agreements --accept-source-agreements --override '--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'}else{Write-Host 'C++ build tools: ready' -ForegroundColor Green}
 winget install --id Microsoft.EdgeWebView2Runtime -e --accept-package-agreements --accept-source-agreements --silent 2>$null;Refresh-Path
}
Write-Host '';Write-Host 'Installing NOVA packages...' -ForegroundColor Cyan
npm.cmd install
if($InstallOnly){Write-Host 'Installed. Run .\Run-NOVA.ps1' -ForegroundColor Green;exit}
Write-Host '';Write-Host 'Starting NOVA...' -ForegroundColor Cyan
npm.cmd run tauri dev
