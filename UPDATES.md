# NOVA updates

NOVA v1.0.2 introduced signed automatic updates. v1.0.3 fixed the release executable so it runs as a normal Windows GUI application.

## v1.0.4 candidate

The next signed update adds the account/internet foundation required for ordinary cross-house use:

- first-run NOVA account login with Google in the system browser;
- DPAPI-protected NOVA session, device identity, saved workspace and hosted-Space capabilities;
- persistent account-backed Space admission;
- project-owned Cloudflare rendezvous/encrypted-control infrastructure that normal users never configure;
- internet invites that no longer depend on reaching a private LAN address;
- stronger message ACK/retry behavior and persistent drafts;
- safer WebRTC negotiation, candidate ordering and one ICE-restart recovery attempt;
- invite copy feedback and fallback;
- production-service validation in build/release scripts.

The v1.0.4 source is a test candidate until the Worker/Google setup and real two-house tests pass. TURN fallback is configurable but is not considered validated until a forced relay candidate is observed on real infrastructure.

## Release rule

`Release-NOVA.ps1` creates a signed installer and updater manifest. With `-Publish`, it uploads a **draft** GitHub release. Keep it draft until the installed candidate has been tested. Once the release is published as latest, existing NOVA installations query `releases/latest/download/latest.json`, verify the signature, install the update and restart.

Never replace the existing NOVA signing private key. The public key embedded in installed clients must continue to match future release signatures.
