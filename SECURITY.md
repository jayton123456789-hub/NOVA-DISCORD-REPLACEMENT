# NOVA v1 Security / networking

NOVA v1 is designed for private trusted friend groups, not public internet communities.

- Every hosted space gets a random join token.
- HTTP file endpoints and WebSocket joins require the token.
- Shared file names are sanitized and stored under generated UUID names.
- Uploads are limited to 100 MB each.
- The host exposes only NOVA's own data directory, not arbitrary PC folders.
- There is no remote command execution feature.
- For remote friend groups, prefer a private mesh VPN such as Tailscale instead of opening the host directly to the public internet.

The invite token is access control, not a replacement for full end-to-end identity/authentication. Do not post invites publicly.
