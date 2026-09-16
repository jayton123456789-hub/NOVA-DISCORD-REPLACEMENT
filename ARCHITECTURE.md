# NOVA Social architecture

```text
Installed NOVA (Tauri/WebView2)
│
├─ React Social UI
│  ├─ account/login + legal notices
│  ├─ Spaces/channels/chat/presence
│  ├─ voice/camera/screen share
│  └─ files/settings/updater UI
│
├─ Rust native core
│  ├─ Windows DPAPI secure values
│  ├─ system-browser OAuth loopback callback
│  ├─ persistent workspace + hosted Space records
│  ├─ embedded Axum host
│  └─ SQLite per-Space state / local file store
│
├─ WebRTC media
│  ├─ direct ICE/STUN where possible
│  └─ short-lived TURN REST credentials from NOVA service when configured
│
└─ NOVA online service (project-owned Cloudflare)
   ├─ Google OAuth exchange -> NOVA session
   ├─ AccountRegistry Durable Object
   │  ├─ account/session hashes
   │  └─ registered device public keys
   └─ SpaceRelay Durable Objects
      ├─ persistent account admission
      ├─ encrypted control/signaling relay
      └─ no audio/video/file payload relay
```

Normal users never create a Cloudflare account or configure infrastructure. The release operator deploys the service once. Existing local data remains usable when online services are unavailable.

The current Worker-backed control path is transitional: the accepted long-term Social architecture still adds signed replicated events, peer replicas/services and scalable media hosts without making Cloudflare the permanent centralized data plane.
