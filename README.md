# NOVA v1.0.1

NOVA v1 is no longer an OS experiment. It is a lean private social desktop app for small friend groups.

## What actually works

- Host a NOVA space directly from the desktop app.
- Join a friend's space with a `nova://HOST:PORT/TOKEN` invite.
- Persistent text channels and message history on the host.
- Create text and voice channels.
- Online member presence and typing indicators.
- Real microphone voice chat using WebRTC.
- Webcam video.
- Screen sharing through WebView2's Screen Capture API.
- System audio is mixed into the stream when Windows supplies an audio track.
- When camera is enabled during screen share, NOVA composites the webcam into the outgoing screen feed. Drag on your local share tile to move the webcam overlay.
- Shared files up to 100 MB, stored on the host and downloadable by everyone in the space.
- Runtime CPU/RAM diagnostics in Settings, with one-click diagnostics export.
- No Three.js, no fake OS shell, no embedded browser, no permanent hardware polling, and no capture pipeline until you actually join voice or share.

## First run

Open PowerShell in the extracted folder:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\Setup-NOVA.ps1
```

After the first successful setup:

```powershell
.\Run-NOVA.ps1
```

## Make an installer for your friends

```powershell
.\Build-NOVA.ps1
```

When it finishes, Windows Explorer opens the Tauri bundle directory. Send the generated installer to your friends.

## Connecting friends

### Same Wi-Fi / LAN
Host a space. NOVA shows an invite like:

`nova://192.168.1.42:38765/abc123...`

Send that invite to your friends.

### Friends outside your house
NOVA v1 is self-hosted and does not depend on a NOVA cloud service. The cleanest route is Tailscale:

1. Host and friends install Tailscale and join the same tailnet.
2. Replace the LAN IP in the NOVA invite with the host's Tailscale IP.
3. Friends paste the invite into NOVA.

Traditional TCP port forwarding for port `38765` also works, but Tailscale is usually much less annoying.

## Performance philosophy

NOVA does not run a 3D renderer or an animation loop while idle. Camera, microphone and screen capture are created only when used. Detailed process telemetry polls only while the Settings panel is open.

## Current architecture note

Voice/video is peer-to-peer WebRTC mesh. That is ideal for the intended small friend-group size because the host does not have to relay everyone’s media. It is not intended for giant public servers. A future large-room version should add an SFU and TURN relay.
