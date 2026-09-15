import { useCallback, useEffect, useRef, useState } from 'react';
import type { Channel, ChatMessage, ConnectionConfig, Member, SharedFile } from '../types';
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

export function useNovaConnection(config: ConnectionConfig | null, username: string) {
  const [state, setState] = useState<State>(empty);
  const socket = useRef<WebSocket | null>(null);
  const signalHandlers = useRef(new Set<SignalHandler>());
  const peerIdRef = useRef('');
  const reconnectTimer = useRef<number | null>(null);
  const intentionallyClosed = useRef(false);

  const send = useCallback((payload: unknown) => {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }, []);

  useEffect(() => {
    if (!config || !username.trim()) { setState(empty); return; }
    intentionallyClosed.current = false;
    let alive = true;

    const connect = () => {
      if (!alive || intentionallyClosed.current) return;
      setState((s) => ({ ...s, status: 'connecting', error: '' }));
      const ws = new WebSocket(wsAddress(config, username.trim()));
      socket.current = ws;

      ws.onopen = () => alive && setState((s) => ({ ...s, status: 'online', error: '' }));
      ws.onerror = () => alive && setState((s) => ({ ...s, status: 'error', error: 'Could not reach this NOVA host.' }));
      ws.onclose = () => {
        if (!alive) return;
        setState((s) => ({ ...s, status: intentionallyClosed.current ? 'offline' : 'connecting' }));
        if (!intentionallyClosed.current) reconnectTimer.current = window.setTimeout(connect, 1800);
      };
      ws.onmessage = (ev) => {
        let msg: any;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (!msg || typeof msg.type !== 'string') return;
        if (msg.type === 'welcome') {
          peerIdRef.current = msg.peer_id;
          setState((s) => ({ ...s, peerId: msg.peer_id, spaceName: msg.space_name, channels: msg.channels ?? [], members: msg.members ?? [], messages: msg.messages ?? [] }));
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
    return () => {
      alive = false;
      intentionallyClosed.current = true;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      socket.current?.close();
      socket.current = null;
    };
  }, [config?.host, config?.port, config?.token, username]);

  const disconnect = useCallback(() => {
    intentionallyClosed.current = true;
    if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
    socket.current?.close();
    setState(empty);
  }, []);

  const sendMessage = useCallback((channelId: string, body: string, attachment?: SharedFile | null) => send({ type: 'message', channel_id: channelId, body, attachment }), [send]);
  const createChannel = useCallback((name: string, kind: 'text' | 'voice') => send({ type: 'create_channel', name, kind }), [send]);
  const setTyping = useCallback((channelId: string, active: boolean) => send({ type: 'typing', channel_id: channelId, active }), [send]);
  const joinVoice = useCallback((channelId: string) => send({ type: 'voice_join', channel_id: channelId }), [send]);
  const leaveVoice = useCallback(() => send({ type: 'voice_leave' }), [send]);
  const sendSignal = useCallback((target: string, data: unknown) => send({ type: 'signal', target, data }), [send]);
  const onSignal = useCallback((handler: SignalHandler) => { signalHandlers.current.add(handler); return () => signalHandlers.current.delete(handler); }, []);

  const uploadFile = useCallback(async (file: File, channelId: string) => {
    if (!config) throw new Error('Not connected.');
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
    const res = await fetch(`${httpBase(config)}/api/files?token=${encodeURIComponent(config.token)}`);
    if (!res.ok) throw new Error('Could not load shared files.');
    return await res.json() as SharedFile[];
  }, [config]);

  const fileUrl = useCallback((id: string) => config ? `${httpBase(config)}/api/files/${encodeURIComponent(id)}/download?token=${encodeURIComponent(config.token)}` : '', [config]);

  return { ...state, sendMessage, createChannel, setTyping, joinVoice, leaveVoice, sendSignal, onSignal, uploadFile, listFiles, fileUrl, disconnect };
}
