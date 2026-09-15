# Implementation status

Branch: feat/social-foundation

The accepted Social plan remains the target: private Windows groups, peer replicas,
zero paid infrastructure, up to 16 call participants, and two active media hosts.
Studio and Vaultspace remain dormant future work.

## Implemented in the first change
- Remote audio playback independent of video tiles, with autoplay recovery.
- Muted video previews prevent duplicate audio.
- Regression tests cover audio-only playback, camera toggles, deafen, and cleanup.
- Diagnostics omit host invite credentials.
- Installer build stops on native command failures.
- Frontend/Rust lockfiles and pinned Rust 1.95.0 toolchain.
- Windows validation workflow.

## Still required before release
- Complete media negotiation, sender ownership, capture cancellation and cleanup.
- Native libp2p/TURN/mediasoup compatibility tests on actual Windows peers.
- Persistent identity, membership, event store, replication and encrypted mailbox.
- Host eligibility, dual-host forwarding, migration and failure recovery.
- Social features, streaming files, migration and signed updater.
- Cross-network, AMD/NVIDIA, sixteen-participant and gaming soak tests.

Passing component tests or compilation does not establish live call reliability.
Do not publish this branch as the completed Social release.
