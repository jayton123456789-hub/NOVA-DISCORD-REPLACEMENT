# NOVA online services

This Worker is project infrastructure. Normal NOVA users do not create or manage Cloudflare accounts.

It provides:
- Google OAuth bootstrap and NOVA account sessions.
- registered-device public keys.
- persistent Space admission keyed to NOVA accounts.
- bounded encrypted control/signaling relay.
- authenticated ICE configuration with short-lived TURN REST credentials when a project TURN pool is configured.

## One-time operator setup

1. From the repository root, run `.\Deploy-NOVA-Services.ps1 -Deploy`. It uses pinned Wrangler 4.132.0, opens Cloudflare authorization if needed, deploys the Worker, and saves the detected workers.dev origin to `%USERPROFILE%\.nova-signing\service-url.txt`.
2. Run `.\Configure-NOVA-Google.ps1`. It opens Google Cloud credentials, prints the exact callback URI, securely prompts for the OAuth client ID/secret, stores them as Worker secrets, redeploys, and verifies Google sign-in is enabled.
3. Release/build scripts read the saved Worker origin and inject it as `VITE_NOVA_SERVICE_URL`, so end users never configure Cloudflare or Google.

If the deploy script cannot detect the workers.dev URL automatically, copy the URL Wrangler prints into `%USERPROFILE%\.nova-signing\service-url.txt`, then run the Google configuration script.

## TURN

NOVA does not ship a permanent TURN secret in the desktop app. When a controlled TURN service is available, configure these Worker values:

- `TURN_URLS`: comma-separated TURN URLs such as `turn:host:3478?transport=udp,turns:host:5349?transport=tcp`
- `TURN_SHARED_SECRET`: the TURN REST shared secret (store as a Worker secret)

The authenticated `/v1/media/ice` endpoint generates one-hour HMAC-SHA1 TURN REST credentials per NOVA user. If TURN is not configured, it returns STUN only and direct WebRTC can still be attempted.

Do not enable a paid fallback automatically. The project's zero-surprise-billing policy remains in force.
