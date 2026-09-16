import { useCallback, useEffect, useRef, useState } from 'react';
import { callIceServers } from '../lib/ice';
import type { Member } from '../types';

type SignalData =
  | { kind: 'offer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

type Args = {
  sessionToken: string;
  selfId: string;
  members: Member[];
  voiceChannel: string | null;
  sendSignal: (target: string, data: unknown) => boolean;
  onSignal: (fn: (from: string, data: unknown) => void) => () => void;
  announceJoin: (channelId: string) => boolean;
  announceLeave: () => boolean;
};

export function useVoice({ sessionToken, selfId, members, voiceChannel, sendSignal, onSignal, announceJoin, announceLeave }: Args) {
  const room = useRef<string | null>(null);
  const captureGeneration = useRef(0);
  const ice = useRef<RTCIceServer[]>([]);
  const negotiation = useRef(new Map<string, { making: boolean; ignore: boolean; settingAnswer: boolean; restarting: boolean; candidates: RTCIceCandidateInit[]; queue: Promise<unknown>; video?: RTCRtpSender; audio?: RTCRtpSender }>());
  const self = useRef(selfId); self.current = selfId;
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
    const state = Array.from(pcs.current).find(([, value]) => value === pc);
    const session = state ? negotiation.current.get(state[0]) : undefined;
    if (!session) return;
    if (audio && !session.audio) session.audio = pc.addTrack(compositeStream.current?.getAudioTracks()[0] ?? audio, compositeStream.current ?? micStream.current!);
    if (video && !session.video) session.video = pc.addTrack(video, compositeStream.current ?? cameraStream.current!);
  }, []);

  const createPc = useCallback((peer: string) => {
    const existing = pcs.current.get(peer);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: ice.current, iceTransportPolicy: localStorage.getItem('nova.forceRelay')==='1'?'relay':'all' });
    pcs.current.set(peer, pc);
    negotiation.current.set(peer, { making: false, ignore: false, settingAnswer: false, restarting: false, candidates: [], queue: Promise.resolve() });
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
      const session = negotiation.current.get(peer);
      if (pc.connectionState === 'connected') {
        if (session) session.restarting = false;
        setMediaNote('');
        return;
      }
      if (pc.connectionState === 'failed' && session && !session.restarting && room.current) {
        session.restarting = true;
        setMediaNote('Voice connection changed. NOVA is trying to reconnect...');
        session.queue = session.queue.then(async () => {
          if (pcs.current.get(peer) !== pc || !room.current) return;
          pc.restartIce();
          if (pc.signalingState !== 'stable') return;
          session.making = true;
          try {
            await attachLocalTracks(pc);
            await pc.setLocalDescription();
            sendSignal(peer, { kind: 'offer', sdp: pc.localDescription! } satisfies SignalData);
          } finally { session.making = false; }
        }).catch(() => {});
        window.setTimeout(() => {
          if (pcs.current.get(peer) !== pc) return;
          if (pc.connectionState === 'failed') {
            setMediaNote('Voice could not recover a working direct or relay path. Leave and rejoin the voice channel to retry.');
            pc.close(); pcs.current.delete(peer); negotiation.current.delete(peer); remote.current.delete(peer); publishRemote();
          } else if (negotiation.current.get(peer)) {
            negotiation.current.get(peer)!.restarting = false;
          }
        }, 8000);
        return;
      }
      if (pc.connectionState === 'closed') {
        pcs.current.delete(peer); negotiation.current.delete(peer); remote.current.delete(peer); publishRemote();
      }
    };
    return pc;
  }, [attachLocalTracks, sendSignal]);

  const makeOffer = useCallback(async (peer: string) => {
    if (!room.current) return;
    const pc = createPc(peer);
    const session = negotiation.current.get(peer)!;
    if (session.making || pc.signalingState !== 'stable') return;
    session.making = true;
    try {
      await attachLocalTracks(pc);
      await pc.setLocalDescription();
      sendSignal(peer, { kind: 'offer', sdp: pc.localDescription! } satisfies SignalData);
    } finally { session.making = false; }
  }, [attachLocalTracks, createPc, sendSignal]);

  useEffect(() => onSignal((from, raw) => {
    if (!room.current || !micStream.current) return;
    const data = raw as SignalData;
    if (!data || !('kind' in data)) return;
    const pc = createPc(from);
    const session = negotiation.current.get(from)!;
    session.queue = session.queue.then(async () => {
      if (pcs.current.get(from) !== pc || !room.current) return;
      if (data.kind === 'offer' || data.kind === 'answer') {
        const collision = data.kind === 'offer' && (session.making || !(pc.signalingState === 'stable' || session.settingAnswer));
        const polite = self.current.localeCompare(from) > 0;
        session.ignore = !polite && collision;
        if (session.ignore) { session.candidates = []; return; }
        session.settingAnswer = data.kind === 'answer';
        await pc.setRemoteDescription(data.sdp);
        session.settingAnswer = false;
        for (const candidate of session.candidates.splice(0)) await pc.addIceCandidate(candidate);
        if (data.kind === 'offer') {
          await attachLocalTracks(pc);
          await pc.setLocalDescription();
          sendSignal(from, { kind: 'answer', sdp: pc.localDescription! } satisfies SignalData);
        }
      } else if (data.kind === 'ice' && !session.ignore) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
        else if (session.candidates.length < 256) session.candidates.push(data.candidate);
      }
    }).catch(() => { session.settingAnswer = false; setMediaNote('Voice negotiation failed. Leave and rejoin to retry.'); });
  }), [attachLocalTracks, createPc, onSignal, sendSignal]);

  useEffect(() => {
    if (!voiceChannel || !selfId) return;
    const peers = members.filter((m) => m.voice_channel === voiceChannel && m.peer_id !== selfId).map((m) => m.peer_id);
    peers.forEach((peer) => {
      const exists = pcs.current.has(peer);
      createPc(peer);
      if (!exists && selfId.localeCompare(peer) < 0) makeOffer(peer).catch(console.warn);
    });
    for (const [peer, pc] of pcs.current) {
      if (!peers.includes(peer)) { pc.close(); pcs.current.delete(peer); negotiation.current.delete(peer); remote.current.delete(peer); }
    }
    publishRemote();
  }, [members, voiceChannel, selfId, createPc, makeOffer]);

  const join = useCallback(async (channelId: string) => {
    const generation = ++captureGeneration.current;
    ice.current = await callIceServers(sessionToken);
    const stream = micStream.current ?? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    if (generation !== captureGeneration.current) { stream.getTracks().forEach(t => t.stop()); throw new Error('Voice join was cancelled.'); }
    micStream.current = stream;
    localAudioTrack()!.enabled = !muted && !deafened;
    room.current = channelId;
    setMediaNote('');
    if (!announceJoin(channelId)) { room.current = null; stream.getTracks().forEach(t => t.stop()); micStream.current = null; throw new Error('Connect to the Space before joining voice.'); }
  }, [announceJoin, muted, deafened, sessionToken]);

  const cleanupPeers = () => { pcs.current.forEach((pc) => pc.close()); pcs.current.clear(); negotiation.current.clear(); remote.current.clear(); publishRemote(); };

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
      const videoSender = Array.from(pcs.current).map(([id, value]) => value === pc ? negotiation.current.get(id)?.video : undefined).find(Boolean);
      if (videoSender) await videoSender.replaceTrack(replacementVideo);
      const audioSender = pc.getSenders().find((s) => s.track?.kind === 'audio');
      if (audioSender && replacementAudio) await audioSender.replaceTrack(replacementAudio);
    }
    setLocalPreview(cameraStream.current ? new MediaStream(cameraStream.current.getVideoTracks()) : null);
    setSharing(false);
  }, []);

  const leave = useCallback(() => {
    captureGeneration.current++; room.current = null;
    announceLeave(); cleanupPeers();
    micStream.current?.getTracks().forEach((t) => t.stop()); micStream.current = null;
    cameraStream.current?.getTracks().forEach((t) => t.stop()); cameraStream.current = null;
    stopShare().catch(() => {});
    setCameraOn(false); setSharing(false); setLocalPreview(null);
  }, [announceLeave, stopShare]);

  const toggleMute = useCallback(() => {
    const next = !muted; setMuted(next);
    micStream.current?.getAudioTracks().forEach((t) => { t.enabled = !next && !deafened; });
  }, [muted, deafened]);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      cameraStream.current?.getTracks().forEach((t) => t.stop()); cameraStream.current = null; shareCameraVideo.current = null; setCameraOn(false);
      if (!sharing) {
        for (const pc of pcs.current.values()) {
          const sender = Array.from(pcs.current).map(([id, value]) => value === pc ? negotiation.current.get(id)?.video : undefined).find(Boolean);
          if (sender) await sender.replaceTrack(null);
        }
        setLocalPreview(null);
      }
      return;
    }
    if (!room.current) throw new Error('Join voice before enabling your camera.');
    const generation = captureGeneration.current;
    const cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
    if (generation !== captureGeneration.current) { cam.getTracks().forEach(t=>t.stop()); return; }
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
        const sender = Array.from(pcs.current).map(([id, value]) => value === pc ? negotiation.current.get(id)?.video : undefined).find(Boolean);
        if (sender) await sender.replaceTrack(track); else { negotiation.current.get(peer)!.video = pc.addTrack(track, cam); await makeOffer(peer); }
      }
      setLocalPreview(new MediaStream([track]));
    }
  }, [cameraOn, sharing, makeOffer]);

  const startShare = useCallback(async () => {
    if (sharing) { await stopShare(); return; }
    if (!room.current) throw new Error('Join voice before sharing.');
    const generation = captureGeneration.current;
    const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 60 } }, audio: true });
    if (generation !== captureGeneration.current) { display.getTracks().forEach(t=>t.stop()); return; }
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
      let vs = Array.from(pcs.current).map(([id, value]) => value === pc ? negotiation.current.get(id)?.video : undefined).find(Boolean);
      if (vs) await vs.replaceTrack(composedVideo); else { negotiation.current.get(peer)!.video = pc.addTrack(composedVideo, out); await makeOffer(peer); }
      const mixed = out.getAudioTracks()[0]; const as = pc.getSenders().find((s) => s.track?.kind === 'audio');
      if (mixed && as) await as.replaceTrack(mixed);
    }
    display.getVideoTracks()[0].onended = () => { stopped = true; stopShare().catch(() => {}); };
  }, [cameraOn, makeOffer, sharing, stopShare]);

  const setOverlayPosition = useCallback((x: number, y: number) => { overlay.current = { ...overlay.current, x: Math.max(.08, Math.min(.92, x)), y: Math.max(.10, Math.min(.90, y)) }; }, []);

  useEffect(() => { micStream.current?.getAudioTracks().forEach(t => {t.enabled = !muted && !deafened;}); }, [muted, deafened]);
  useEffect(() => () => { captureGeneration.current++; room.current=null; if(drawFrame.current)cancelAnimationFrame(drawFrame.current); audioContext.current?.close().catch(()=>{}); compositeStream.current?.getTracks().forEach(t=>t.stop()); cleanupPeers(); micStream.current?.getTracks().forEach((t) => t.stop()); cameraStream.current?.getTracks().forEach((t) => t.stop()); shareStream.current?.getTracks().forEach((t) => t.stop()); }, []);

  return { join, leave, muted, toggleMute, deafened, setDeafened, cameraOn, toggleCamera, sharing, startShare, remoteStreams, localPreview, mediaNote, setMediaNote, setOverlayPosition };
}
