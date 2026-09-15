param([switch]$Publish)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
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
if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
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
  gh release create "v$version" $bundle $signature $manifestPath --repo $repo --target $commit --title "NOVA $version" --notes 'Signed Windows build with automatic startup updates and voice playback fixes.' --draft
  if ($LASTEXITCODE -ne 0) { throw 'Release upload failed' }
  Write-Host 'Draft uploaded. Publish it after validation.'
}
Write-Host "Signed installer: $bundle"
