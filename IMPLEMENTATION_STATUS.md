# NOVA implementation status

Development base: published v1.0.3 (`411341e`, `feat/social-foundation`).
Current candidate: **v1.0.4 source** on `feat/nova-account-internet-foundation`. It is intended to be built as a signed test update after the one-time NOVA online-service setup below.

The accepted Social target remains: private Windows friend groups, persistent identities and Spaces, no recurring manual networking setup, zero surprise billing, low idle resource use, distributed replicas, and scalable/recoverable calls. Studio/Vaultspace remain dormant future work.

## Released and verified in v1.0.2/v1.0.3
- Signed GitHub-based automatic updater and NSIS installer.
- Startup update checks plus deferred in-session update handling.
- Remote audio playback independent of camera/video tiles.
- Windows GUI subsystem fix (no unwanted terminal on release builds).
- Lockfiles, pinned Rust toolchain, frontend tests, release verification script and validation workflow.

## Integrated for v1.0.4 test candidate
- Hosted Spaces have stable UUIDs, DPAPI-protected 64-hex capabilities and one SQLite database per Space.
- Workspace restores username, current/saved Spaces and selected channel across restarts, scoped to the logged-in NOVA account.
- New Spaces start empty; no premade channels are seeded.
- Invite dialog has explicit dismissal/copy status and clipboard fallback in the installed app.
- Message/channel writes use request IDs plus host ACK/error responses; drafts remain until persistence is confirmed.
- Connection readiness waits for authenticated `welcome`; reconnect uses timeout/backoff/jitter and explicit retry.
- Host validates channel kinds, attachments, voice membership and targeted signaling.
- Encrypted outbound internet-control bridge exists via a project-owned Cloudflare Worker/Durable Objects deployment.
- Relay crypto binds direction/connection context, fragments bounded messages and rejects replay/out-of-order frames.
- Browser-level integration previously passed with three encrypted guests, a custom channel, persisted message and late-join history.
- WebRTC negotiation tracks per-peer senders/candidate queues, handles offer collision more safely and attempts ICE restart before teardown.
- Permission/capture generation guards stop stale microphone/camera/screen requests after leave/cancel.

## Account + production internet foundation
- First-run account gate with `Continue with Google` and in-app Terms/Privacy notices.
- Google OAuth runs in the system browser; the desktop app never receives the Google password or Google client secret.
- Worker exchanges Google authorization codes server-side, creates NOVA accounts, issues opaque 30-day NOVA sessions and stores session hashes.
- Windows stores NOVA sessions, Space capabilities, relay-owner capability and private device-key material using user-scoped DPAPI, not browser localStorage.
- Each installation creates separate P-256 signing and encryption keypairs and registers only public keys with the service.
- Internet relay registration and guest admission require an authenticated NOVA account session.
- A NOVA identity becomes a persistent Space member after first valid invite admission; later relay admission no longer depends solely on the invite hash.
- Project-owned Cloudflare remains invisible to normal users. Only the NOVA release operator performs the one-time deployment.
- `Deploy-NOVA-Services.ps1` now handles Cloudflare authorization/deploy and records the service URL when possible.
- `Configure-NOVA-Google.ps1` handles the one-time Google OAuth secret installation/redeploy after the Google Web client is created.
- Build/release scripts refuse a shareable build unless the production service is reachable and Google sign-in is configured.
- TURN credentials are not hardcoded in the desktop app. `/v1/media/ice` can generate one-hour TURN REST credentials from a project-side secret; without TURN configuration NOVA attempts direct WebRTC with STUN.

## What must be proved on the Windows development PC before publishing v1.0.4 as latest
1. Pull this branch and run the release validation path (`npm ci`, frontend tests/build, Worker integration tests/dry-run, Rust tests/check).
2. Deploy the Worker/Durable Objects with `.\Deploy-NOVA-Services.ps1 -Deploy`.
3. Configure the Google Web OAuth client once with `.\Configure-NOVA-Google.ps1`.
4. Confirm installed Google login, DPAPI session restore and restart auto-login.
5. Perform a genuine two-house text/control test with two NOVA accounts: admit a new member, create channels, exchange messages, restart both PCs, reconnect and verify history.
6. Test direct WebRTC voice, cameras and screen share between the two houses.
7. Configure/prove a controlled zero-surprise-billing TURN path. Forced `iceTransportPolicy: relay` must produce a real `relay` candidate before TURN fallback is claimed reliable.
8. Build/sign the v1.0.4 installer, upload it as a **draft** release, locally install/test it, then publish `latest.json`/release and verify an existing v1.0.3 installation updates automatically.

Internet file transfer remains intentionally disabled on the relay path. Full distributed signed event replication, creator-offline operation, peer service election, SFU/media-host failover, 16-client load and AMD/NVIDIA gaming soak remain later milestones.

Passing compilation/unit tests does not establish live cross-house media reliability. The purpose of v1.0.4 is to put the account/internet foundation onto real PCs and measure it honestly.
