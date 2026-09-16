# NOVA v1.0.4 candidate — Codex handoff

## What this package is

This is the recovered and integrated NOVA Social v1.0.4 candidate source assembled from Nick's local post-v1.0.3 working copy plus the account/internet foundation work completed in ChatGPT.

GitHub repository: `jayton123456789-hub/NOVA-DISCORD-REPLACEMENT`
Development branch: `feat/nova-account-internet-foundation`
Draft PR: `#2`
Checkpoint commit: `cad96e2ef87cd2fc55824f3814c441a26b218fed`
Base release: v1.0.3 / `411341ed4b6ffc7670e77b576cc95f3638613618`

The files in this ZIP include one small consistency cleanup after checkpoint commit `cad96e2`: package/Cargo/Tauri version metadata is aligned to `1.0.4`. Review that change before pushing a follow-up commit.

## Integrated in this candidate

- Persistent hosted Spaces with stable UUIDs and per-Space SQLite state.
- New Spaces start empty; no pre-seeded channels.
- Account-scoped workspace restore across restarts.
- Google-based NOVA account flow using the system browser and a loopback callback.
- User-scoped protected storage on Windows for session/device/workspace/Space secrets.
- Per-device P-256 signing + ECDH keypairs; only public keys are registered with the service.
- Project-owned Cloudflare Worker/Durable Objects service for account bootstrap, Space admission, rendezvous and encrypted control/signaling relay.
- Normal NOVA users do not create or configure Cloudflare accounts.
- Internet invite transport that no longer depends on a private LAN address.
- ACK/request-error writes for messages and channels; chat drafts are preserved until host persistence is confirmed.
- Authenticated `welcome` readiness, reconnect timeout/backoff/jitter and manual retry.
- Host-side channel/attachment/voice/signaling validation.
- Relay AES-GCM framing with context binding, bounded fragmentation and replay/out-of-order rejection.
- WebRTC perfect-negotiation groundwork, queued ICE candidates, persistent sender tracking and one ICE-restart recovery attempt.
- Capture-generation guards for stale mic/camera/screen permission completion.
- Server-issued TURN REST credentials when a project TURN service is configured. No permanent TURN shared secret is shipped in the desktop app.
- Release/build scripts that require a reachable production NOVA service and configured Google sign-in before a shareable build.
- Existing signed GitHub updater remains pointed at `releases/latest/download/latest.json`.

## Important release status

Do NOT call this fully production-validated yet. It is a test candidate that needs to be built and exercised on the Windows development machine.

The environment that assembled this package did not have Nick's updater private key, Cloudflare authorization, Google OAuth secrets, Windows Rust/Tauri build environment, or a second remote Windows PC. Therefore it could not truthfully produce the signed NSIS installer or prove live cross-house media.

GitHub Actions validation for PR #2 failed before any useful build steps ran; earlier project history had the same account/billing-level Actions issue. Do not treat that as a source-code test result.

## Validation performed here

- JavaScript syntax checks pass for the Worker, Worker tests and transport/TURN test scripts.
- All 34 `src/**/*.ts` / `src/**/*.tsx` files pass TypeScript syntactic transpilation (`transpileModule`) with zero syntax errors.
- JSON / JSONC configuration was inspected and parsed during integration.
- Source was compared against the recovered local working copy and the published v1.0.3 branch.
- Version metadata in this ZIP is aligned to 1.0.4 in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`.

Full semantic TypeScript dependency checking and Rust compilation still must be run on the Windows dev machine.

## Exact next pass for Codex

1. Diff this package against branch `feat/nova-account-internet-foundation` and PR #2. Preserve all existing v1.0.2/v1.0.3 updater signing infrastructure.
2. Run `npm ci`, `npm test`, and `npm run build`.
3. Run `node scripts/test-service.mjs` and a Wrangler dry-run.
4. Run `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib` and `cargo check --locked --manifest-path src-tauri/Cargo.toml`.
5. Review `src-tauri/src/auth.rs`, `secure_store.rs`, `storage.rs`, `src/lib/account.ts`, `service.ts`, `relay.ts`, `relayCrypto.ts`, `useNovaConnection.ts`, `useVoice.ts`, and `services/rendezvous/src/index.js` for security/race/lifecycle problems.
6. Deploy the NOVA Worker/Durable Objects from the project-owned Cloudflare account using `Deploy-NOVA-Services.ps1 -Deploy`.
7. Configure the Google Web OAuth client with `Configure-NOVA-Google.ps1` and verify `/health` reports `googleConfigured: true`.
8. Build a signed v1.0.4 candidate using the EXISTING updater signing private key. Never generate a replacement key.
9. Test Google login, Windows-protected session restore and automatic sign-in after restart.
10. Test two real PCs in different homes: invite admission, custom channel creation, bidirectional messages, restart/reconnect, late-join history.
11. Test voice-only, camera toggles, simultaneous joins, screen share and network interruption.
12. Configure a controlled TURN service under the zero-surprise-billing policy and force `iceTransportPolicy: relay`; require a real ICE `relay` candidate before claiming TURN works.
13. Upload v1.0.4 as a draft release first. Test it manually, then publish it as latest and verify an installed v1.0.3 updates automatically.

## Known intentionally unfinished areas

- Internet file transfer is explicitly disabled on the relay path; local/LAN files remain separate.
- The current Space host remains the state authority for this milestone. Full distributed signed-event replication and creator-offline operation are later work.
- Peer service election, peer-hosted relays, SFU/media-host failover, 16-client scaling and AMD/NVIDIA gaming soak are later milestones.
- TURN fallback is architected/configurable but not live-proven yet.

## Product requirement to preserve

NOVA Social should behave like a normal lightweight app. Users install it, sign in, and use Spaces without Tailscale, port forwarding, Wrangler, Cloudflare dashboards or recurring networking setup. Cloudflare/Google configuration is an operator/release concern only. Studio/Vaultspace remains dormant and consumes effectively zero resources until explicitly invoked in future work.
