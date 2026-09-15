# NOVA AI Handoff

Use this file as context when asking a coding AI to work on NOVA.

## Product identity

NOVA is a lightweight social desktop application for a small group of friends. Think Discord first, with selected PS5-style polish and focus transitions. It is **not** an operating system or Windows shell.

The default user experience should prioritize:

1. Text chat and channels
2. Voice chat
3. Camera and screen sharing with system audio when available
4. Shared project files
5. Friend/member presence
6. Low idle CPU, RAM, and GPU usage

Advanced or experimental features must not make the main social UI harder to understand.

## Architecture

Frontend: React + TypeScript inside Tauri/WebView2.

Native/backend side: Rust. A user can host a NOVA space directly from the desktop app. The embedded Axum server handles HTTP, WebSocket signaling/realtime events, SQLite persistence, and shared-file storage.

Media: WebRTC peer-to-peer mesh for small friend groups. The embedded host coordinates signaling but does not relay normal media streams.

## Performance rule

When the user is sitting in a text channel doing nothing, NOVA should be mostly asleep. Do not introduce always-on Three.js/WebGL animation, media capture, detailed telemetry polling, or other continuous work unless the active feature requires it.

## Current build status

v1.0.1 includes fixes for the Rust compile errors found during the first Windows v1 compile attempt. A fresh complete Windows build should still be treated as a release-validation step before calling the build production-ready.
