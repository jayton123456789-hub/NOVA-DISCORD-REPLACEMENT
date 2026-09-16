param(
  [Parameter(Mandatory=$true)][string]$ServiceUrl,
  [switch]$RequireGoogle
)
$ErrorActionPreference = 'Stop'
$origin = $ServiceUrl.Trim().TrimEnd('/')
if ($origin -notmatch '^https://') { throw 'Production NOVA service URL must use HTTPS.' }
try {
  $health = Invoke-RestMethod -Uri "$origin/health" -Method Get -TimeoutSec 12
} catch {
  throw "NOVA online service is not reachable at $origin/health. $($_.Exception.Message)"
}
if ($health.service -ne 'NOVA online services' -or [int]$health.version -lt 3) {
  throw "Unexpected NOVA online service response from $origin. Deploy the current services/rendezvous Worker first."
}
if ($RequireGoogle -and !$health.googleConfigured) {
  throw 'Google sign-in is not configured on the NOVA Worker yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET Worker secrets, then redeploy.'
}
Write-Host "NOVA service OK: $origin (Google=$($health.googleConfigured), TURN=$($health.turnConfigured))" -ForegroundColor Green
