# NOVA AI handoff

## Product identity
NOVA is a lightweight Windows social desktop app for a small trusted friend group. Discord-like Social comes first: persistent text/voice Spaces, cameras, screen sharing, files, presence and automatic updates. Studio/Vaultspace are future modules and must consume effectively zero resources unless explicitly opened.

## Current base
Published latest release: v1.0.3. The signed updater is already active in installed v1.0.2+ clients. The current development branch should be treated as an unreleased account/internet foundation, not as a production release.

## Architecture now
- React/TypeScript in Tauri/WebView2.
- Rust embedded host: Axum WebSocket/HTTP, SQLite messages/channels/files, per-Space storage.
- Google sign-in -> project Cloudflare Worker -> NOVA opaque session.
- Windows DPAPI stores service session and private device keys.
- Cloudflare Durable Objects provide account registry, Space admission, rendezvous and bounded encrypted control/signaling relay. Users never manage Cloudflare.
- WebRTC carries microphone/camera/screen media directly where possible. ICE configuration comes from the authenticated NOVA service; TURN is project-configured and must not expose a permanent secret in the client.

## Important distinctions
The current persistent hosted-Space model is not yet the final distributed Space model. The relay is an intermediate production transport that enables cross-house testing while reusing the embedded Rust host. Final Social still needs signed event replication, creator-offline operation, peer service roles, SFU/media-host recovery and 16-user validation.

## Immediate release gates
1. Validate recovered code on Windows (`npm test/build`, Rust tests/check, Worker dry-run).
2. Deploy `services/rendezvous` to the project Cloudflare Free account.
3. Configure Google OAuth web client callback to `/v1/auth/google/callback` and Worker secrets.
4. Put the Worker origin in `.nova-signing/service-url.txt` on the release PC.
5. Prove real cross-house account login + text + persisted membership/restart.
6. Configure/prove TURN with a forced relay candidate.
7. Prove real two-PC voice/camera/share/reconnect lifecycle.
8. Only then bump/publish v1.0.4 and use installed v1.0.3 to verify the updater end-to-end.

## Security rules
Never commit Google client secret, TURN shared secret, Cloudflare credentials, updater private signing key, NOVA service sessions or private device JWKs. Account/session secrets do not belong in browser localStorage. Do not introduce a paid infrastructure fallback automatically.
