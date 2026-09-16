# NOVA Social

NOVA is a lightweight Windows social desktop app for a small private friend group. The released line is currently v1.0.3; the account/internet foundation in this source tree is development work for the next release and must pass the deployment/real-PC gates in `IMPLEMENTATION_STATUS.md` before publication.

## Released foundation

v1.0.3 already provides the signed Windows installer/updater, host-based persistent chat, text/voice channels, presence/typing, WebRTC microphone/camera/screen share, local shared files, diagnostics, and the voice-only playback/Windows GUI fixes.

## Current development direction

This branch adds the pieces required for a normal cross-house app experience:

- First-run `Continue with Google` NOVA accounts.
- Windows-protected NOVA sessions and private per-device keys.
- Stable hosted Spaces and automatic workspace restoration.
- Empty user-created Spaces instead of premade channels.
- Request/ACK message persistence and draft preservation.
- Project-owned Cloudflare account/admission/rendezvous infrastructure that ordinary users never configure.
- Encrypted outbound control/signaling relay for different-house connections.
- Account-backed Space membership after first invite admission.
- Authenticated ICE configuration with server-issued short-lived TURN credentials when a controlled TURN pool is configured.
- Safer WebRTC offer collision/candidate handling and capture cancellation.

The current internet control bridge deliberately reuses the embedded Rust host so cross-house Social can be proven before the later fully distributed event-replication architecture replaces the host as a single state authority.

## Developer setup

Normal users should install NOVA once and sign in. They should not run these steps.

For development:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\Setup-NOVA.ps1
.\Run-NOVA.ps1
```

The online service lives in `services/rendezvous`. See its README for the one-time Cloudflare/Google operator setup.

A shareable production build requires the deployed NOVA service origin. Save it on the release PC at:

```text
%USERPROFILE%\.nova-signing\service-url.txt
```

Then build with:

```powershell
.\Build-NOVA.ps1
```

Signed releases continue through `Release-NOVA.ps1` and GitHub Releases. See `UPDATES.md`.

## Performance rule

Opening NOVA for chat should keep the app mostly asleep. No Studio engine, media capture, canvas compositor, detailed metrics polling, SFU/relay helper or other heavy subsystem should run unless the active feature needs it.

## Not finished yet

Do not treat the current development branch as proof of production internet media. Before v1.0.4, the Worker/Google service must be deployed, different-house account/text persistence tested, a controlled TURN path must produce a forced relay candidate, and voice/camera/share/reconnect must pass real two-PC Windows tests. Full distributed signed-event replication, creator-offline operation, peer service election, scalable media hosts and 16-user validation remain later Social milestones.
