# NOVA security / networking

NOVA targets private friend groups, but internet-facing components should still use explicit authentication and bounded inputs.

- Google authentication occurs in the system browser; NOVA never receives the Google password.
- Google OAuth client secret stays in the Worker environment, never the desktop bundle.
- Worker-issued NOVA sessions are random opaque capabilities; the Worker stores their hashes.
- On Windows, the desktop stores the NOVA session and private device JWKs with user-scoped DPAPI protection, not localStorage.
- Each device has separate P-256 signing and encryption keypairs; only public JWKs are registered online.
- Hosted Spaces retain stable IDs and strong random Space capabilities. Cross-house relay admission additionally requires a valid NOVA account session and persists account membership after first admission.
- Relay application payloads use AES-GCM with random nonces, direction/connection associated data, ordered sequence numbers and replay rejection.
- The Cloudflare relay is limited to control/signaling; it is not an audio/video/file relay.
- TURN shared secrets remain server-side. The Worker can issue short-lived TURN REST credentials; no permanent TURN secret is shipped in NOVA.
- HTTP file endpoints and direct local WebSocket joins still use the Space capability in the current host-based model.
- Shared file names are sanitized, files use generated IDs, and v1 direct uploads remain capped at 100 MB.
- Internet file transfer is deliberately disabled until a bounded streaming/peer design is implemented.
- Diagnostics must not include Space capabilities, service sessions, OAuth secrets or private device keys.
- No remote command-execution feature is permitted.
- No paid infrastructure fallback may activate automatically.

The current Space capability remains part of transport encryption and direct-host access. Final distributed membership should continue moving authorization toward signed per-user/device membership rather than permanent shared secrets.
