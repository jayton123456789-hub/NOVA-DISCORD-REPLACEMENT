$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$serviceFile = Join-Path $env:USERPROFILE '.nova-signing/service-url.txt'
if (!(Test-Path $serviceFile)) { throw 'Deploy NOVA online services first with .\Deploy-NOVA-Services.ps1 -Deploy.' }
$origin = (Get-Content $serviceFile -Raw).Trim().TrimEnd('/')
$callback = "$origin/v1/auth/google/callback"

Write-Host ''
Write-Host 'Google OAuth setup for NOVA' -ForegroundColor Cyan
Write-Host "1. Create a Google OAuth client of type 'Web application'." -ForegroundColor White
Write-Host "2. Add this Authorized redirect URI:" -ForegroundColor White
Write-Host "   $callback" -ForegroundColor Yellow
Write-Host '3. Copy the Client ID and Client Secret, then return here.' -ForegroundColor White
Write-Host ''
Start-Process 'https://console.cloud.google.com/apis/credentials' | Out-Null
$clientId = (Read-Host 'Google OAuth Client ID').Trim()
if (!$clientId) { throw 'Google OAuth Client ID is required.' }
$secure = Read-Host 'Google OAuth Client Secret' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $clientSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
if (!$clientSecret) { throw 'Google OAuth Client Secret is required.' }

Set-Location (Join-Path $root 'services\rendezvous')
$clientId | npx.cmd --yes wrangler@4.132.0 secret put GOOGLE_CLIENT_ID
if ($LASTEXITCODE -ne 0) { throw 'Could not save GOOGLE_CLIENT_ID.' }
$clientSecret | npx.cmd --yes wrangler@4.132.0 secret put GOOGLE_CLIENT_SECRET
if ($LASTEXITCODE -ne 0) { throw 'Could not save GOOGLE_CLIENT_SECRET.' }
$clientSecret = $null

npx.cmd --yes wrangler@4.132.0 deploy
if ($LASTEXITCODE -ne 0) { throw 'Worker redeploy failed after Google configuration.' }
& (Join-Path $root 'scripts\Test-NOVA-Service.ps1') -ServiceUrl $origin -RequireGoogle
Write-Host ''
Write-Host 'Google sign-in is configured for NOVA.' -ForegroundColor Green
