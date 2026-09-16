param([switch]$Publish)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$serviceFile = Join-Path $env:USERPROFILE '.nova-signing/service-url.txt'
if (!$env:VITE_NOVA_SERVICE_URL) {
  if ($env:NOVA_SERVICE_URL) { $env:VITE_NOVA_SERVICE_URL = $env:NOVA_SERVICE_URL.Trim() }
  elseif (Test-Path $serviceFile) { $env:VITE_NOVA_SERVICE_URL = (Get-Content $serviceFile -Raw).Trim() }
}
if (!$env:VITE_NOVA_SERVICE_URL) { throw 'NOVA online service URL is required for a shareable build. Deploy services once, then save the Worker origin in .nova-signing/service-url.txt.' }
if ($env:VITE_NOVA_SERVICE_URL -notmatch '^https://') { throw 'Production NOVA service URL must use HTTPS.' }
& (Join-Path $PSScriptRoot 'scripts\Test-NOVA-Service.ps1') -ServiceUrl $env:VITE_NOVA_SERVICE_URL -RequireGoogle
$repo = 'jayton123456789-hub/NOVA-DISCORD-REPLACEMENT'
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$key = Join-Path $env:USERPROFILE '.nova-signing/nova.key'
if (!(Test-Path $key) -and !$env:TAURI_SIGNING_PRIVATE_KEY) { throw 'The project signing key is required. Never generate a replacement key for an existing release.' }
if (!$env:TAURI_SIGNING_PRIVATE_KEY) { $env:TAURI_SIGNING_PRIVATE_KEY = $key }
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
$rust = Join-Path $env:USERPROFILE '.cargo/bin'
if (Test-Path $rust) { $env:PATH = "$rust;$env:PATH" }
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed' }
node scripts/test-service.mjs
if ($LASTEXITCODE -ne 0) { throw 'Online-service tests failed' }
npx.cmd --yes wrangler@4.132.0 deploy --dry-run --config services/rendezvous/wrangler.jsonc
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare Worker dry-run failed' }
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
if ($LASTEXITCODE -ne 0) { throw 'Rust tests failed' }
npm.cmd run tauri build -- --bundles nsis
if ($LASTEXITCODE -ne 0) { throw 'Signed build failed' }
# PE subsystem 2 is Windows GUI; subsystem 3 would spawn a console window.
$exeBytes = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'src-tauri/target/release/nova-social.exe'))
$peOffset = [BitConverter]::ToInt32($exeBytes, 0x3c)
$subsystem = [BitConverter]::ToUInt16($exeBytes, $peOffset + 24 + 68)
if ($subsystem -ne 2) { throw "Release executable must use the Windows GUI subsystem; got $subsystem" }
$bundle = Join-Path $PSScriptRoot "src-tauri/target/release/bundle/nsis/NOVA_${version}_x64-setup.exe"
$signature = "$bundle.sig"
if (!(Test-Path $signature)) { throw 'Missing update signature' }
cargo run --locked --manifest-path src-tauri/Cargo.toml --example verify_update -- $bundle
if ($LASTEXITCODE -ne 0) { throw 'Signature verification failed' }
$manifest = @{
  version = $version
  notes = 'NOVA signed desktop update.'
  pub_date = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
  platforms = @{ 'windows-x86_64' = @{
    signature = (Get-Content $signature -Raw).Trim()
    url = "https://github.com/$repo/releases/download/v$version/NOVA_${version}_x64-setup.exe"
  }}
}
$manifestPath = Join-Path (Split-Path $bundle) 'latest.json'
$manifest | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 $manifestPath
if ($Publish) {
  if (git status --porcelain) { throw 'Commit all source changes before publishing.' }
  $commit = git rev-parse HEAD
  gh release create "v$version" $bundle $signature $manifestPath --repo $repo --target $commit --title "NOVA $version" --notes 'Signed NOVA desktop update. See the repository release notes for the validated changes in this version.' --draft
  if ($LASTEXITCODE -ne 0) { throw 'Release upload failed' }
  Write-Host 'Draft uploaded. Publish it after validation.'
}
Write-Host "Signed installer: $bundle"
