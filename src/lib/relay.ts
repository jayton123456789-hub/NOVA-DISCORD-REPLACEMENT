import type { ConnectionConfig, HostStatus } from '../types';
import { encryptedChannel, joinHash } from './relayCrypto';
import { wsAddress } from './connection';
import { serviceEndpoint, validateServiceEndpoint } from './service';

export const relayEndpoint = serviceEndpoint;
export const validateRelay = validateServiceEndpoint;
function relayAddress(endpoint: string, space: string) { return `${validateRelay(endpoint).replace(/^http/, 'ws')}/v1/spaces/${space}/connect`; }
function transmit(ws: WebSocket, frame: unknown) {
  if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 3 * 1024 * 1024) throw new Error('Control connection is unavailable or overloaded');
  ws.send(JSON.stringify(frame));
}

// Implements the subset of WebSocket used by the connection hook.
export class RelaySocket {
  readyState: number = WebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  private ws: WebSocket;
  private output: Promise<unknown> = Promise.resolve();
  private input: Promise<unknown> = Promise.resolve();
  private outgoing?: Awaited<ReturnType<typeof encryptedChannel>>;
  private incoming?: Awaited<ReturnType<typeof encryptedChannel>>;
  private id = '';
  constructor(config: ConnectionConfig, name: string, sessionToken: string) {
    this.ws = new WebSocket(relayAddress(config.relayUrl!, config.spaceId!));
    this.ws.onopen = () => { joinHash(config.token).then(hash => transmit(this.ws, { role: 'guest', session: sessionToken, joinHash: hash })).catch(() => this.fail()); };
    this.ws.onmessage = e => {
      this.input = this.input.then(async () => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'ready') {
          this.id = msg.id;
          this.outgoing = await encryptedChannel(config.token, `${config.spaceId}|${this.id}|guest`);
          this.incoming = await encryptedChannel(config.token, `${config.spaceId}|${this.id}|host`);
          this.readyState = WebSocket.OPEN;
          this.send(JSON.stringify({ type: 'hello', name }));
          this.onopen?.();
        } else if (msg.type === 'data') {
          if (!this.incoming) throw new Error('Unauthenticated relay');
          const clear = await this.incoming.open(msg.payload);
          if (clear !== null) this.onmessage?.({ data: clear });
        }
      }).catch(() => this.fail());
    };
    this.ws.onerror = () => this.onerror?.();
    this.ws.onclose = () => { this.readyState = WebSocket.CLOSED; this.onclose?.(); };
  }
  send(text: string) {
    this.output = this.output.then(async () => {
      if (!this.outgoing) throw new Error('Relay is not ready');
      for (const payload of await this.outgoing.seal(text)) transmit(this.ws, { type: 'data', payload });
    }).catch(() => this.fail());
  }
  close() { this.readyState = WebSocket.CLOSING; this.ws.close(); }
  private fail() { this.onerror?.(); this.close(); }
}

export function startInternetHost(host: HostStatus, sessionToken: string, onStatus: (text: string, ready: boolean) => void) {
  let stopped = false;
  let ws: WebSocket | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  const peers = new Map<string, { local?: WebSocket; input: Promise<unknown>; output: Promise<unknown>; incoming: Awaited<ReturnType<typeof encryptedChannel>>; outgoing: Awaited<ReturnType<typeof encryptedChannel>> }>();
  const closePeers = () => { peers.forEach(p => p.local?.close()); peers.clear(); };
  async function connect() {
    try {
      onStatus('Connecting internet service...', false);
      const endpoint = validateRelay(relayEndpoint);
      const registered = await fetch(`${endpoint}/v1/spaces/${host.space_id}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
        body: JSON.stringify({ owner: host.relay_owner, joinHash: await joinHash(host.token) }), signal: AbortSignal.timeout(8000)
      });
      if (!registered.ok) throw new Error(`Registration failed (${registered.status})`);
      if (stopped) return;
      const socket = new WebSocket(relayAddress(endpoint, host.space_id)); ws = socket;
      const deadline = setTimeout(() => socket.close(), 10000);
      socket.onopen = () => transmit(socket, { role: 'host', session: sessionToken, owner: host.relay_owner });
      let messages: Promise<unknown> = Promise.resolve();
      socket.onmessage = e => {
        messages = messages.then(async () => {
          const msg = JSON.parse(e.data);
          if (msg.type === 'ready') { clearTimeout(deadline); failures = 0; onStatus('Internet invitations ready', true); }
          else if (msg.type === 'join') {
            peers.set(msg.id, { input: Promise.resolve(), output: Promise.resolve(), incoming: await encryptedChannel(host.token, `${host.space_id}|${msg.id}|guest`), outgoing: await encryptedChannel(host.token, `${host.space_id}|${msg.id}|host`) });
          } else if (msg.type === 'leave') { peers.get(msg.id)?.local?.close(); peers.delete(msg.id); }
          else if (msg.type === 'data') {
            const peer = peers.get(msg.id); if (!peer) return;
            const clear = await peer.incoming.open(msg.payload); if (clear === null) return;
            if (!peer.local) {
              const hello = JSON.parse(clear);
              if (hello.type !== 'hello' || typeof hello.name !== 'string' || hello.name.length > 28) throw new Error('Invalid peer greeting');
              const local = new WebSocket(wsAddress({ host: '127.0.0.1', port: host.port, token: host.token }, hello.name)); peer.local = local;
              local.onmessage = message => {
                peer.output = peer.output.then(async () => {
                  for (const payload of await peer.outgoing.seal(message.data)) transmit(socket, { type: 'data', id: msg.id, payload });
                }).catch(() => local.close());
              };
              local.onclose = () => {
                peer.output = peer.output.then(async () => { for (const payload of await peer.outgoing.seal('{"type":"host_closed"}')) transmit(socket, { type: 'data', id: msg.id, payload }); }).catch(() => {});
              };
            } else {
              if (peer.local.readyState !== WebSocket.OPEN) throw new Error('Host session is not ready');
              peer.local.send(clear);
            }
          }
        }).catch(() => { onStatus('Internet session error; reconnecting...', false); socket.close(); });
      };
      socket.onclose = () => { clearTimeout(deadline); closePeers(); reconnect(); };
      socket.onerror = () => socket.close();
    } catch (e) { onStatus(String(e), false); reconnect(); }
  }
  function reconnect() {
    if (stopped) return;
    onStatus('Internet service unavailable. Retrying; local access still works.', false);
    timer = setTimeout(connect, Math.min(30000, 1500 * 2 ** Math.min(failures++, 4)) + Math.random() * 500);
  }
  if (relayEndpoint) void connect();
  else onStatus('Internet service has not been configured for this build.', false);
  return () => { stopped = true; clearTimeout(timer); ws?.close(); closePeers(); };
}
