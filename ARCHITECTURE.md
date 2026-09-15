# NOVA v1 Architecture

```text
NOVA desktop (Tauri/WebView2)
│
├─ React UI
│  ├─ channels + chat
│  ├─ member presence
│  ├─ shared files
│  └─ WebRTC voice/video/screen share
│
└─ Rust
   ├─ optional embedded NOVA host
   │  ├─ Axum HTTP/WebSocket server
   │  ├─ SQLite messages/channels/files metadata
   │  └─ host-side shared file storage
   └─ on-demand process diagnostics
```

Realtime text and signaling use one small WebSocket connection per user. Media does not pass through the host; WebRTC peers exchange it directly after signaling.
