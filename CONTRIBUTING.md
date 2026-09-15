# Contributing to NOVA

NOVA is being built as a lightweight Discord replacement for small friend groups.

## Development flow

1. Clone the repository.
2. Run `Set-ExecutionPolicy -Scope Process Bypass -Force` in PowerShell if needed.
3. Run `./Setup-NOVA.ps1` once.
4. After setup, use `./Run-NOVA.ps1` for normal development runs.
5. Create a branch for changes and open a pull request back into `main`.

## Product rules

- Social/chat is the primary product. Avoid turning NOVA back into a desktop shell or fake OS.
- Idle resource usage matters. Do not add permanent render loops, always-on capture pipelines, or unnecessary polling.
- Camera, microphone, screen capture, diagnostics, and other heavier systems should initialize only when actually used.
- Avoid placeholder UI and dead buttons. If a feature is visible, it should either work or be intentionally omitted until it does.
- Keep the default interface understandable to someone coming from Discord.

## Core stack

- Tauri 2
- React 19 + TypeScript
- Rust
- Axum WebSocket/HTTP host
- SQLite
- WebRTC for peer-to-peer voice/video/screen sharing
