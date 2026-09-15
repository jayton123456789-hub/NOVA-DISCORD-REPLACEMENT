import { useCallback, useEffect, useRef, useState } from 'react';
import type { Member } from '../types';

type SignalData =
  | { kind: 'offer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

type Args = {
  selfId: string;
  members: Member[];
  voiceChannel: string | null;
  sendSignal: (target: string, data: unknown) => boolean;
  onSignal: (fn: (from: string, data: unknown) => void) => () => void;
  announceJoin: (channelId: string) => boolean;
  announceLeave: () => boolean;
};

export function useVoice({ selfId, members, voiceChannel, sendSignal, onSignal, announceJoin, announceLeave }: Args) {
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const remote = useRef(new Map<string, MediaStream>());
  const micStream = useRef<MediaStream | null>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const shareStream = useRef<MediaStream | null>(null);
  const compositeStream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const drawFrame = useRef<number | null>(null);
  const shareCameraVideo = useRef<HTMLVideoElement | null>(null);
  const overlay = useRef({ x: .73, y: .70, w: .23 });
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [localPreview, setLocalPreview] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [mediaNote, setMediaNote] = useState('');

  const publishRemote = () => {
    const next: Record<string, MediaStream> = {};
    remote.current.forEach((v, k) => { next[k] = v; });
    setRemoteStreams(next);
  };

  const localAudioTrack = () => micStream.current?.getAudioTracks()[0] ?? null;
  const currentVideoTrack = () => compositeStream.current?.getVideoTracks()[0] ?? cameraStream.current?.getVideoTracks()[0] ?? null;

  const attachLocalTracks = useCallback(async (pc: RTCPeerConnection) => {
    const audio = localAudioTrack();
    const video = currentVideoTrack();
    if (audio && !pc.getSenders().some((s) => s.track?.kind === 'audio')) pc.addTrack(audio, micStream.current!);
    if (video && !pc.getSenders().some((s) => s.track?.kind === 'video')) pc.addTrack(video, compositeStream.current ?? cameraStream.current!);
  }, []);

  const createPc = useCallback((peer: string) => {
    const existing = pcs.current.get(peer);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
    pcs.current.set(peer, pc);
    remote.current.set(peer, new MediaStream());
    publishRemote();
    pc.onicecandidate = (e) => { if (e.candidate) sendSignal(peer, { kind: 'ice', candidate: e.candidate.toJSON() } satisfies SignalData); };
    pc.ontrack = (e) => {
      const stream = remote.current.get(peer) ?? new MediaStream();
      if (!stream.getTracks().some((t) => t.id === e.track.id)) stream.addTrack(e.track);
      remote.current.set(peer, stream);
      e.track.onended = publishRemote;
      publishRemote();
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        pc.close(); pcs.current.delete(peer); remote.current.delete(peer); publishRemote();
      }
    };
    return pc;
  }, [sendSignal]);

  const makeOffer = useCallback(async (peer: string) => {
    const pc = createPc(peer);
    if (pc.signalingState !== 'stable') return;
    await attachLocalTracks(pc);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(peer, { kind: 'offer', sdp: pc.localDescription! } satisfies SignalData);
  }, [attachLocalTracks, createPc, sendSignal]);

  useEffect(() => onSignal(async (from, raw) => {
    const data = raw as SignalData;
    if (!data || !('kind' in data)) return;
    const pc = createPc(from);
    try {
      if (data.kind === 'offer') {
        await pc.setRemoteDescription(data.sdp);
        await attachLocalTracks(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(from, { kind: 'answer', sdp: pc.localDescription! } satisfies SignalData);
      } else if (data.kind === 'answer') {
        if (pc.signalingState === 'have-local-offer') await pc.setRemoteDescription(data.sdp);
      } else if (data.kind === 'ice') {
        await pc.addIceCandidate(data.candidate);
      }
    } catch (err) { console.warn('NOVA WebRTC signal failed', err); }
  }), [attachLocalTracks, createPc, onSignal, sendSignal]);

  useEffect(() => {
    if (!voiceChannel || !selfId) return;
    const peers = members.filter((m) => m.voice_channel === voiceChannel && m.peer_id !== selfId).map((m) => m.peer_id);
    peers.forEach((peer) => {
      createPc(peer);
      if (selfId.localeCompare(peer) < 0) makeOffer(peer).catch(console.warn);
    });
    for (const [peer, pc] of pcs.current) {
      if (!peers.includes(peer)) { pc.close(); pcs.current.delete(peer); remote.current.delete(peer); }
    }
    publishRemote();
  }, [members, voiceChannel, selfId, createPc, makeOffer]);

  const join = useCallback(async (channelId: string) => {
    if (!micStream.current) {
      micStream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    }
    localAudioTrack()!.enabled = !muted;
    announceJoin(channelId);
  }, [announceJoin, muted]);

  const cleanupPeers = () => { pcs.current.forEach((pc) => pc.close()); pcs.current.clear(); remote.current.clear(); publishRemote(); };

  const stopShare = useCallback(async () => {
    if (drawFrame.current) cancelAnimationFrame(drawFrame.current);
    drawFrame.current = null;
    shareStream.current?.getTracks().forEach((t) => t.stop());
    compositeStream.current?.getTracks().forEach((t) => t.stop());
    shareStream.current = null; compositeStream.current = null; shareCameraVideo.current = null;
    if (audioContext.current) await audioContext.current.close().catch(() => {});
    audioContext.current = null;
    const replacementVideo = cameraStream.current?.getVideoTracks()[0] ?? null;
    const replacementAudio = localAudioTrack();
    for (const pc of pcs.current.values()) {
      const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (videoSender) await videoSender.replaceTrack(replacementVideo);
      const audioSender = pc.getSenders().find((s) => s.track?.kind === 'audio');
      if (audioSender && replacementAudio) await audioSender.replaceTrack(replacementAudio);
    }
    setLocalPreview(cameraStream.current ? new MediaStream(cameraStream.current.getVideoTracks()) : null);
    setSharing(false);
  }, []);

  const leave = useCallback(() => {
    announceLeave(); cleanupPeers();
    micStream.current?.getTracks().forEach((t) => t.stop()); micStream.current = null;
    cameraStream.current?.getTracks().forEach((t) => t.stop()); cameraStream.current = null;
    if (sharing) stopShare().catch(() => {});
    setCameraOn(false); setSharing(false); setLocalPreview(null);
  }, [announceLeave, sharing, stopShare]);

  const toggleMute = useCallback(() => {
    const next = !muted; setMuted(next);
    micStream.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
  }, [muted]);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      cameraStream.current?.getTracks().forEach((t) => t.stop()); cameraStream.current = null; shareCameraVideo.current = null; setCameraOn(false);
      if (!sharing) {
        for (const pc of pcs.current.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) await sender.replaceTrack(null);
        }
        setLocalPreview(null);
      }
      return;
    }
    const cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
    cameraStream.current = cam; setCameraOn(true);
    if (sharing) {
      const preview = document.createElement('video');
      preview.srcObject = new MediaStream(cam.getVideoTracks());
      preview.muted = true;
      await preview.play();
      shareCameraVideo.current = preview;
    } else {
      const track = cam.getVideoTracks()[0];
      for (const [peer, pc] of pcs.current) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(track); else { pc.addTrack(track, cam); await makeOffer(peer); }
      }
      setLocalPreview(new MediaStream([track]));
    }
  }, [cameraOn, sharing, makeOffer]);

  const startShare = useCallback(async () => {
    if (sharing) { await stopShare(); return; }
    const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 60 } }, audio: true });
    shareStream.current = display;
    const screenVideo = document.createElement('video');
    screenVideo.srcObject = new MediaStream(display.getVideoTracks()); screenVideo.muted = true; await screenVideo.play();
    if (cameraStream.current?.getVideoTracks().length) {
      const preview = document.createElement('video');
      preview.srcObject = new MediaStream(cameraStream.current.getVideoTracks());
      preview.muted = true;
      await preview.play();
      shareCameraVideo.current = preview;
    } else {
      shareCameraVideo.current = null;
    }
    const settings = display.getVideoTracks()[0].getSettings();
    const width = Math.min(1920, settings.width || 1280); const height = Math.round(width / ((settings.width || 16) / (settings.height || 9)));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    let stopped = false;
    const draw = () => {
      if (stopped) return;
      ctx.drawImage(screenVideo, 0, 0, width, height);
      const camVideo = shareCameraVideo.current;
      if (camVideo) {
        const w = width * overlay.current.w; const h = w * 9 / 16;
        const x = Math.min(width - w - 16, Math.max(16, overlay.current.x * width - w / 2));
        const y = Math.min(height - h - 16, Math.max(16, overlay.current.y * height - h / 2));
        ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.max(8, w * .035)); ctx.clip(); ctx.drawImage(camVideo, x, y, w, h); ctx.restore();
        ctx.strokeStyle = 'rgba(160,205,255,.8)'; ctx.lineWidth = Math.max(2, width / 700); ctx.strokeRect(x, y, w, h);
      }
      drawFrame.current = requestAnimationFrame(draw);
    };
    draw();
    const canvasStream = canvas.captureStream(30);
    const composedVideo = canvasStream.getVideoTracks()[0];
    const out = new MediaStream([composedVideo]);
    const displayAudio = display.getAudioTracks();
    const mic = localAudioTrack();
    if (mic || displayAudio.length) {
      const ac = new AudioContext(); audioContext.current = ac;
      const dest = ac.createMediaStreamDestination();
      if (mic) ac.createMediaStreamSource(new MediaStream([mic])).connect(dest);
      if (displayAudio[0]) ac.createMediaStreamSource(new MediaStream([displayAudio[0]])).connect(dest);
      if (!displayAudio[0]) setMediaNote('This capture source did not provide system audio. Pick an entire screen if you need game audio.');
      const mixed = dest.stream.getAudioTracks()[0]; if (mixed) out.addTrack(mixed);
    }
    compositeStream.current = out; setLocalPreview(out); setSharing(true);
    for (const [peer, pc] of pcs.current) {
      let vs = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (vs) await vs.replaceTrack(composedVideo); else { pc.addTrack(composedVideo, out); await makeOffer(peer); }
      const mixed = out.getAudioTracks()[0]; const as = pc.getSenders().find((s) => s.track?.kind === 'audio');
      if (mixed && as) await as.replaceTrack(mixed);
    }
    display.getVideoTracks()[0].onended = () => { stopped = true; stopShare().catch(() => {}); };
  }, [cameraOn, makeOffer, sharing, stopShare]);

  const setOverlayPosition = useCallback((x: number, y: number) => { overlay.current = { ...overlay.current, x: Math.max(.08, Math.min(.92, x)), y: Math.max(.10, Math.min(.90, y)) }; }, []);

  useEffect(() => () => { cleanupPeers(); micStream.current?.getTracks().forEach((t) => t.stop()); cameraStream.current?.getTracks().forEach((t) => t.stop()); shareStream.current?.getTracks().forEach((t) => t.stop()); }, []);

  return { join, leave, muted, toggleMute, deafened, setDeafened, cameraOn, toggleCamera, sharing, startShare, remoteStreams, localPreview, mediaNote, setMediaNote, setOverlayPosition };
}
