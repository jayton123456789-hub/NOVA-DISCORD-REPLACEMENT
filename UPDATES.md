# Signed NOVA updates

Install version 1.0.2 or newer once. Older builds do not contain an updater.
Release builds check GitHub's latest published release at startup. A valid newer
signed installer is downloaded, verified, and installed before Social opens.
Checking fails open after eight seconds; downloads time out after two minutes.
Open NOVA now cancels the startup update before installation begins.
While running, checks occur approximately every thirty minutes and on focus
when overdue. Updates discovered during use are applied on the next launch.

## Local release (works while Actions is unavailable)
Bump package.json, src-tauri/Cargo.toml, and src-tauri/tauri.conf.json together.
Refresh both lockfiles, commit and push the source, then run:

    ./Release-NOVA.ps1 -Publish

This builds, signs and uploads a draft. Review/test the draft, then publish it.
Never overwrite a published version: ship a higher version for corrections.

The project private key is outside the checkout in the current Windows user's
.nova-signing directory, restricted by NTFS permissions. Keep a secure offline
backup of that directory. Never commit the private key or replace its identity.
Only the public verification key belongs in tauri.conf.json.

## GitHub Actions
The repository owner must resolve the existing Actions account billing lock and
configure the release environment with TAURI_SIGNING_PRIVATE_KEY and
TAURI_SIGNING_PRIVATE_KEY_PASSWORD (empty for the current local key).
Use the existing project key, not a newly generated key. Protect the release
environment with reviewer approval. Then run Release NOVA manually.

Tauri update signatures are configured; Windows Authenticode signing is not.
An unknown-publisher prompt may therefore appear on manual installation.
