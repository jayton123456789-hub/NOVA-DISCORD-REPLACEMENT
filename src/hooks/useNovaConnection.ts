import { useCallback, useEffect, useRef, useState } from 'react';
import type { Channel, ChatMessage, ConnectionConfig, Member, SharedFile } from '../types';
import { RelaySocket } from '../lib/relay';
import { httpBase, wsAddress } from '../lib/connection';

type SignalHandler = (from: string, data: unknown) => void;

type State = {
  status: 'offline' | 'connecting' | 'online' | 'error';
  error: string;
  peerId: string;
  spaceName: string;
  channels: Channel[];
  members: Member[];
  messages: ChatMessage[];
  typing: Record<string, string[]>;
};

const empty: State = { status: 'offline', error: '', peerId: '', spaceName: '', channels: [], members: [], messages: [], typing: {} };

export function useNovaConnection(config: ConnectionConfig | null, username: string, sessionToken: string) {
  const [state, setState] = useState<State>(empty);
  const socket = useRef<WebSocket | RelaySocket | null>(null);
  const signalHandlers = useRef(new Set<SignalHandler>());
  const peerIdRef = useRef('');
  const reconnectTimer = useRef<number | null>(null);
  const intentionallyClosed = useRef(false);
  const ready = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(v => v + 1), []);
  const pending = useRef(new Map<string, { resolve: () => void; reject: (e: Error) => void; timer: number }>());
  const failPending = () => {
    pending.current.forEach(p => { clearTimeout(p.timer); p.reject(new Error('Connection lost. Your draft is still here; retry when connected.')); });
    pending.current.clear();
  };

  const send = useCallback((payload: unknown) => {
    const ws = socket.current;
    if (!ready.current || !ws || ws.readyState !== WebSocket.OPEN) return false;
    try { ws.send(JSON.stringify(payload)); return true; } catch { return false; }
  }, []);

  useEffect(() => {
    if (!config || !username.trim()) { setState(empty); return; }
    intentionallyClosed.current = false;
    let alive = true;
    let failures = 0;
    let handshakeTimer: number | undefined;
    ready.current = false;
    setState(empty);

    const connect = () => {
      if (!alive || intentionallyClosed.current) return;
      setState((s) => ({ ...s, status: 'connecting', error: '' }));
      let ws: WebSocket | RelaySocket;
      try { ws = config.relayUrl ? new RelaySocket(config, username.trim(), sessionToken) : new WebSocket(wsAddress(config, username.trim())); }
      catch (e) { setState(s => ({ ...s, status: 'error', error: String(e) })); return; }
      socket.current = ws;

      handshakeTimer = window.setTimeout(() => {
        if (alive && !ready.current) { ws.close(); }
      }, 10000);
      ws.onopen = () => {}; // Online only after the authenticated welcome arrives.
      ws.onerror = () => alive && setState((s) => ({ ...s, status: 'error', error: 'Could not reach this NOVA host.' }));
      ws.onclose = () => {
        if (!alive || socket.current !== ws) return;
        window.clearTimeout(handshakeTimer);
        ready.current = false;
        failPending();
        failures += 1;
        const error = config.relayUrl ? 'Cannot reach this Space through NOVA online services. The host must be online and the account/relay service reachable. Check your internet connection and retry.' : 'Cannot reach this Space. The host must be online and reachable. Local IP invites do not work across different homes without a shared VPN or network route. Check the invite and firewall, then retry.';
        setState((s) => ({ ...s, members: [], peerId: '', status: intentionallyClosed.current ? 'offline' : 'error', error }));
        if (!intentionallyClosed.current && failures < 5) reconnectTimer.current = window.setTimeout(connect, Math.min(30000, 1000 * 2 ** failures) + Math.random() * 500);
      };
      ws.onmessage = (ev: {data: string}) => {
        if (!alive || socket.current !== ws) return;
        let msg: any;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (!msg || typeof msg.type !== 'string') return;
        if (msg.type === 'host_closed') { ws.close(); return; }
        if (msg.type === 'ack' || msg.type === 'request_error') {
          const request = pending.current.get(msg.request_id);
          if (request) { clearTimeout(request.timer); pending.current.delete(msg.request_id); msg.type === 'ack' ? request.resolve() : request.reject(new Error(msg.error || 'The host could not save this action.')); }
        } else if (msg.type === 'welcome') {
          window.clearTimeout(handshakeTimer);
          ready.current = true;
          failures = 0;
          peerIdRef.current = msg.peer_id;
          setState((s) => ({ ...s, status: 'online', error: '', peerId: msg.peer_id, spaceName: msg.space_name, channels: msg.channels ?? [], members: msg.members ?? [], messages: msg.messages ?? [] }));
        } else if (msg.type === 'presence') {
          setState((s) => ({ ...s, members: msg.members ?? [] }));
        } else if (msg.type === 'channels') {
          setState((s) => ({ ...s, channels: msg.channels ?? [] }));
        } else if (msg.type === 'message') {
          setState((s) => s.messages.some((m) => m.id === msg.message?.id) ? s : ({ ...s, messages: [...s.messages, msg.message].slice(-1000) }));
        } else if (msg.type === 'typing') {
          const { channel_id, peer_id, name, active } = msg;
          setState((s) => {
            const current = new Set(s.typing[channel_id] ?? []);
            const key = `${peer_id}:${name}`;
            active ? current.add(key) : current.delete(key);
            return { ...s, typing: { ...s.typing, [channel_id]: Array.from(current) } };
          });
        } else if (msg.type === 'signal' && msg.target === peerIdRef.current) {
          signalHandlers.current.forEach((fn) => fn(msg.from, msg.data));
        }
      };
    };

    connect();
    const onOnline = () => retry();
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearTimeout(handshakeTimer);
      ready.current = false;
      failPending();
      alive = false;
      intentionallyClosed.current = true;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      socket.current?.close();
      socket.current = null;
    };
  }, [config?.host, config?.port, config?.token, config?.relayUrl, config?.spaceId, username, sessionToken, attempt]);

  const disconnect = useCallback(() => {
    intentionallyClosed.current = true;
    ready.current = false;
    failPending();
    if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
    socket.current?.close();
    setState(empty);
  }, []);

  const request = useCallback((payload: Record<string, unknown>) => new Promise<void>((resolve, reject) => {
    const request_id = crypto.randomUUID();
    const timer = window.setTimeout(() => { pending.current.delete(request_id); reject(new Error('No save confirmation from the host. Your draft has been kept.')); }, 10000);
    pending.current.set(request_id, { resolve, reject, timer });
    if (!send({ ...payload, request_id })) { clearTimeout(timer); pending.current.delete(request_id); reject(new Error('Not connected. Your draft has been kept.')); }
  }), [send]);
  const sendMessage = useCallback((channelId: string, body: string, attachment?: SharedFile | null) => request({ type: 'message', channel_id: channelId, body, attachment }), [request]);
  const createChannel = useCallback((name: string, kind: 'text' | 'voice') => request({ type: 'create_channel', name, kind }), [request]);
  const setTyping = useCallback((channelId: string, active: boolean) => send({ type: 'typing', channel_id: channelId, active }), [send]);
  const joinVoice = useCallback((channelId: string) => send({ type: 'voice_join', channel_id: channelId }), [send]);
  const leaveVoice = useCallback(() => send({ type: 'voice_leave' }), [send]);
  const sendSignal = useCallback((target: string, data: unknown) => send({ type: 'signal', target, data }), [send]);
  const onSignal = useCallback((handler: SignalHandler) => { signalHandlers.current.add(handler); return () => signalHandlers.current.delete(handler); }, []);

  const uploadFile = useCallback(async (file: File, channelId: string) => {
    if (!config) throw new Error('Not connected.');
    if (config.relayUrl) throw new Error('Internet file transfers are not available in this test build.');
    if (file.size > 100 * 1024 * 1024) throw new Error('NOVA v1 caps shared files at 100 MB each.');
    const data = new FormData();
    data.append('file', file);
    data.append('channel_id', channelId);
    data.append('uploader', username);
    const res = await fetch(`${httpBase(config)}/api/files?token=${encodeURIComponent(config.token)}`, { method: 'POST', body: data });
    if (!res.ok) throw new Error(await res.text() || 'Upload failed.');
    return await res.json() as SharedFile;
  }, [config, username]);

  const listFiles = useCallback(async () => {
    if (!config) return [] as SharedFile[];
    if (config.relayUrl) throw new Error('Internet file transfers are not available in this test build.');
    const res = await fetch(`${httpBase(config)}/api/files?token=${encodeURIComponent(config.token)}`);
    if (!res.ok) throw new Error('Could not load shared files.');
    return await res.json() as SharedFile[];
  }, [config]);

  const fileUrl = useCallback((id: string) => config ? `${httpBase(config)}/api/files/${encodeURIComponent(id)}/download?token=${encodeURIComponent(config.token)}` : '', [config]);

  return { ...state, retry, sendMessage, createChannel, setTyping, joinVoice, leaveVoice, sendSignal, onSignal, uploadFile, listFiles, fileUrl, disconnect };
}
