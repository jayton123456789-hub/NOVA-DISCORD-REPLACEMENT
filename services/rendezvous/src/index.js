import { DurableObject } from 'cloudflare:workers';

const HEX = /^[a-f0-9]{64}$/;
const ID = /^[a-f0-9-]{36}$/;
const MAX_FRAME = 96 * 1024;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const TICKET_TTL = 2 * 60 * 1000;
const FLOW_TTL = 10 * 60 * 1000;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const respond = (text, status = 200, extra = {}) => new Response(text, { status, headers: { ...cors, ...extra } });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const redirect = location => new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
const hash = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2, '0')).join('');
const randomHex = (bytes = 32) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), n => n.toString(16).padStart(2, '0')).join('');
const accountStub = env => env.ACCOUNTS.get(env.ACCOUNTS.idFromName('global'));
const bearer = request => {
  const value = request.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim().toLowerCase() : '';
};

function loopbackReturn(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/callback' || url.username || url.password || url.search || url.hash) return null;
    return url.toString();
  } catch { return null; }
}

async function bodyJson(request, max = 16 * 1024) {
  if (Number(request.headers.get('Content-Length') || 0) > max) throw new Error('too_large');
  const reader = request.body?.getReader();
  let size = 0;
  const chunks = [];
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > max) { await reader.cancel(); throw new Error('too_large'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  try { return JSON.parse(text || '{}'); } catch { throw new Error('invalid_json'); }
}

async function validPublicKey(value, algorithm, usages) {
  if (!value || typeof value !== 'object' || value.kty !== 'EC' || value.crv !== 'P-256' ||
      Object.hasOwn(value, 'd') || typeof value.x !== 'string' || typeof value.y !== 'string') return false;
  if (Object.keys(value).some(key => !['kty', 'crv', 'x', 'y', 'ext', 'key_ops', 'alg', 'use'].includes(key))) return false;
  try { await crypto.subtle.importKey('jwk', value, { name: algorithm, namedCurve: 'P-256' }, false, usages); return true; }
  catch { return false; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return respond('');
    if (url.pathname === '/health') return json({ service: 'NOVA online services', version: 3, googleConfigured: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), turnConfigured: !!(env.TURN_URLS && env.TURN_SHARED_SECRET) });

    if (url.pathname === '/v1/auth/dev') {
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return respond('Not found', 404);
      const headers = new Headers(request.headers); headers.set('x-nova-dev-auth', '1');
      const body = await request.text();
      return accountStub(env).fetch(new Request(request.url, { method: request.method, headers, body }));
    }

    if (/^\/v1\/(auth|account|devices|media)\//.test(url.pathname)) return accountStub(env).fetch(request);

    const match = /^\/v1\/spaces\/([a-f0-9-]{36})\/(register|connect)$/.exec(url.pathname);
    if (!match) return respond('Not found', 404);
    return env.SPACES.get(env.SPACES.idFromName(match[1])).fetch(request);
  }
};

export class AccountRegistry extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.ctx = ctx; this.env = env; }

  async authenticate(request) {
    const token = bearer(request);
    if (!HEX.test(token)) return null;
    const key = `session:${await hash(token)}`;
    const session = await this.ctx.storage.get(key);
    if (!session || session.expiresAt <= Date.now()) { if (session) await this.ctx.storage.delete(key); return null; }
    const user = await this.ctx.storage.get(`user:${session.userId}`);
    if (!user) return null;
    return { token, key, session, user };
  }

  publicUser(user) { return { id: user.id, email: user.email, name: user.name, picture: user.picture || null }; }

  async userForIdentity(sub, profile) {
    let id = await this.ctx.storage.get(`google:${sub}`);
    let user = id ? await this.ctx.storage.get(`user:${id}`) : null;
    if (!user) {
      id = crypto.randomUUID();
      user = { id, googleSub: sub, email: profile.email, name: profile.name || profile.email.split('@')[0], picture: profile.picture || null, createdAt: Date.now() };
      await this.ctx.storage.put({ [`google:${sub}`]: id, [`user:${id}`]: user });
    } else {
      user = { ...user, email: profile.email, name: profile.name || user.name, picture: profile.picture || user.picture || null };
      await this.ctx.storage.put(`user:${id}`, user);
    }
    return user;
  }

  async createSession(userId) {
    const token = randomHex();
    const key = `session:${await hash(token)}`;
    const expiresAt = Date.now() + SESSION_TTL;
    await this.ctx.storage.put(key, { userId, expiresAt, deviceId: null });
    return { token, expiresAt };
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/v1/auth/google/start' && request.method === 'GET') {
      const clientId = this.env.GOOGLE_CLIENT_ID;
      const clientSecret = this.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) return json({ error: 'Google sign-in is not configured for this NOVA deployment.' }, 503);
      const returnUrl = loopbackReturn(url.searchParams.get('return') || '');
      const appState = (url.searchParams.get('app_state') || '').toLowerCase();
      const challenge = (url.searchParams.get('challenge') || '').toLowerCase();
      if (!returnUrl || !HEX.test(appState) || !HEX.test(challenge)) return json({ error: 'Invalid NOVA sign-in callback.' }, 400);
      const oauthState = randomHex();
      await this.ctx.storage.put(`flow:${oauthState}`, { returnUrl, appState, challenge, expiresAt: Date.now() + FLOW_TTL });
      const callback = `${url.origin}/v1/auth/google/callback`;
      const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      google.searchParams.set('client_id', clientId);
      google.searchParams.set('redirect_uri', callback);
      google.searchParams.set('response_type', 'code');
      google.searchParams.set('scope', 'openid email profile');
      google.searchParams.set('state', oauthState);
      google.searchParams.set('prompt', 'select_account');
      return redirect(google.toString());
    }

    if (url.pathname === '/v1/auth/google/callback' && request.method === 'GET') {
      const state = (url.searchParams.get('state') || '').toLowerCase();
      const flow = HEX.test(state) ? await this.ctx.storage.get(`flow:${state}`) : null;
      if (!flow || flow.expiresAt <= Date.now()) return respond('NOVA sign-in state expired. Return to NOVA and try again.', 400);
      await this.ctx.storage.delete(`flow:${state}`);
      const finish = params => { const out = new URL(flow.returnUrl); Object.entries(params).forEach(([k,v]) => out.searchParams.set(k, String(v))); out.searchParams.set('app_state', flow.appState); return redirect(out.toString()); };
      if (url.searchParams.get('error')) return finish({ error: url.searchParams.get('error') });
      const code = url.searchParams.get('code');
      if (!code) return finish({ error: 'missing_code' });
      try {
        const callback = `${url.origin}/v1/auth/google/callback`;
        const token = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: this.env.GOOGLE_CLIENT_ID, client_secret: this.env.GOOGLE_CLIENT_SECRET, redirect_uri: callback, grant_type: 'authorization_code' }),
        });
        if (!token.ok) return finish({ error: 'google_token_exchange_failed' });
        const tokens = await token.json();
        if (!tokens.access_token) return finish({ error: 'google_token_missing' });
        const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        if (!info.ok) return finish({ error: 'google_profile_failed' });
        const profile = await info.json();
        if (typeof profile.sub !== 'string' || typeof profile.email !== 'string' || profile.email_verified !== true) return finish({ error: 'google_identity_invalid' });
        const user = await this.userForIdentity(profile.sub, profile);
        const ticket = randomHex();
        await this.ctx.storage.put(`ticket:${await hash(ticket)}`, { userId: user.id, challenge: flow.challenge, expiresAt: Date.now() + TICKET_TTL });
        return finish({ ticket });
      } catch { return finish({ error: 'google_sign_in_unavailable' }); }
    }

    if (url.pathname === '/v1/auth/complete' && request.method === 'POST') {
      let body; try { body = await bodyJson(request, 2048); } catch { return json({ error: 'Invalid sign-in completion request.' }, 400); }
      const ticket = String(body.ticket || '').toLowerCase();
      if (!HEX.test(ticket)) return json({ error: 'Invalid or expired NOVA sign-in ticket.' }, 401);
      const key = `ticket:${await hash(ticket)}`;
      const record = await this.ctx.storage.get(key);
      const verifier = String(body.verifier || '');
      if (!record || record.expiresAt <= Date.now() || !HEX.test(verifier) || await hash(verifier) !== record.challenge) return json({ error: 'Invalid or expired NOVA sign-in ticket.' }, 401);
      await this.ctx.storage.delete(key);
      const user = await this.ctx.storage.get(`user:${record.userId}`);
      if (!user) return json({ error: 'NOVA account was not found.' }, 401);
      const session = await this.createSession(user.id);
      return json({ session: session.token, expiresAt: session.expiresAt, user: this.publicUser(user) });
    }

    if (url.pathname === '/v1/auth/dev' && request.method === 'POST' && request.headers.get('x-nova-dev-auth') === '1') {
      let body; try { body = await bodyJson(request, 4096); } catch { return json({ error: 'Invalid development account.' }, 400); }
      const email = String(body.email || `dev-${crypto.randomUUID()}@nova.invalid`).slice(0, 254);
      const name = String(body.name || 'NOVA Developer').slice(0, 80);
      const user = await this.userForIdentity(`dev:${email}`, { email, name, picture: null });
      const session = await this.createSession(user.id);
      return json({ session: session.token, expiresAt: session.expiresAt, user: this.publicUser(user) });
    }

    if (url.pathname === '/v1/account/me' && request.method === 'GET') {
      const auth = await this.authenticate(request);
      return auth ? json(this.publicUser(auth.user)) : json({ error: 'Your NOVA session has expired.' }, 401);
    }

    if (url.pathname === '/v1/auth/logout' && request.method === 'POST') {
      const auth = await this.authenticate(request);
      if (auth) await this.ctx.storage.delete(auth.key);
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/v1/media/ice' && request.method === 'GET') {
      const auth = await this.authenticate(request);
      if (!auth) return json({ error: 'Your NOVA session has expired.' }, 401);
      const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];
      const urls = String(this.env.TURN_URLS || '').split(',').map(v => v.trim()).filter(Boolean);
      const secret = String(this.env.TURN_SHARED_SECRET || '');
      if (urls.length && secret) {
        const username = `${Math.floor(Date.now() / 1000) + 3600}:${auth.user.id}`;
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
        const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(username)));
        const credential = btoa(Array.from(signature, n => String.fromCharCode(n)).join(''));
        iceServers.push({ urls, username, credential });
      }
      return json({ iceServers, relayAvailable: urls.length > 0 && !!secret });
    }

    if (url.pathname === '/v1/devices/register' && request.method === 'POST') {
      const auth = await this.authenticate(request);
      if (!auth) return json({ error: 'Your NOVA session has expired.' }, 401);
      let body; try { body = await bodyJson(request, 24 * 1024); } catch { return json({ error: 'Invalid device registration.' }, 400); }
      const deviceId = String(body.deviceId || '');
      if (!ID.test(deviceId) || !await validPublicKey(body.signingPublicKey, 'ECDSA', ['verify']) || !await validPublicKey(body.encryptionPublicKey, 'ECDH', [])) return json({ error: 'Invalid device registration.' }, 400);
      const record = { userId: auth.user.id, deviceId, deviceName: String(body.deviceName || 'NOVA device').slice(0, 80), signingPublicKey: body.signingPublicKey, encryptionPublicKey: body.encryptionPublicKey, updatedAt: Date.now() };
      await this.ctx.storage.put(`device:${auth.user.id}:${deviceId}`, record);
      await this.ctx.storage.put(auth.key, { ...auth.session, deviceId });
      return json({ ok: true });
    }

    if (url.pathname === '/internal/session/verify') {
      const auth = await this.authenticate(request);
      return auth ? json({ userId: auth.user.id, deviceId: auth.session.deviceId || null, name: auth.user.name }) : json({ error: 'Unauthorized' }, 401);
    }

    return respond('Not found', 404);
  }
}

// Stores only hashed capabilities and account membership. Message bodies remain encrypted on clients.
// This is a bounded control/signaling relay, never an audio/video or file relay.
export class SpaceRelay extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.ctx = ctx; this.env = env; }

  async verifySession(session) {
    if (!HEX.test(session || '')) return null;
    const response = await accountStub(this.env).fetch(new Request('https://internal/internal/session/verify', { headers: { Authorization: `Bearer ${session}` } }));
    return response.ok ? response.json() : null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/register') && request.method === 'POST') {
      const account = await this.verifySession(bearer(request));
      if (!account) return json({ error: 'Sign in to NOVA before hosting on the internet.' }, 401);
      let body; try { body = await bodyJson(request, 1024); } catch (error) { return respond(error.message === 'too_large' ? 'Too large' : 'Invalid JSON', error.message === 'too_large' ? 413 : 400); }
      if (!HEX.test(body.owner || '') || !HEX.test(body.joinHash || '')) return respond('Invalid capabilities', 400);
      const ownerHash = await hash(body.owner);
      return this.ctx.blockConcurrencyWhile(async () => {
        const existing = await this.ctx.storage.get('credentials');
        if (existing && (existing.ownerHash !== ownerHash || existing.ownerUserId !== account.userId)) return respond('Unauthorized', 403);
        if (existing && existing.joinHash !== body.joinHash) return respond('Capability rotation requires a new Space', 409);
        await this.ctx.storage.put('credentials', { ownerHash, ownerUserId: account.userId, joinHash: body.joinHash });
        await this.ctx.storage.put(`member:${account.userId}`, { admittedAt: Date.now(), owner: true });
        return respond('Registered');
      });
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return respond('WebSocket required', 426);
    const saved = await this.ctx.storage.get('credentials');
    if (!saved) return respond('Unknown Space', 404);
    const sockets = this.ctx.getWebSockets();
    for (const socket of sockets) {
      const a = socket.deserializeAttachment();
      if (!a.role && Date.now() - a.opened > 10000) socket.close(1008, 'Authentication timed out');
    }
    if (this.ctx.getWebSockets().length >= 40) return respond('Space connection limit reached', 429);
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ opened: Date.now(), role: null, id: crypto.randomUUID(), userId: null, window: Date.now(), count: 0 });
    await this.ctx.storage.setAlarm(Date.now() + 10000);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_FRAME) { ws.close(1009, 'Control message too large'); return; }
    let msg; try { msg = JSON.parse(raw); } catch { ws.close(1008, 'Invalid frame'); return; }
    const a = ws.deserializeAttachment();
    if (Date.now() - a.window > 10000) { a.window = Date.now(); a.count = 0; }
    if (++a.count > (a.role === 'host' ? 1200 : 120)) { ws.close(1008, 'Rate limit'); return; }
    if (!a.role) {
      const saved = await this.ctx.storage.get('credentials');
      if (Date.now() - a.opened > 10000) { ws.close(1008, 'Authentication timed out'); return; }
      const account = await this.verifySession(String(msg.session || '').toLowerCase());
      if (!account) { ws.close(1008, 'NOVA account required'); return; }
      if (msg.role === 'host' && HEX.test(msg.owner || '') && await hash(msg.owner) === saved.ownerHash && account.userId === saved.ownerUserId) {
        for (const other of this.ctx.getWebSockets()) {
          if (other !== ws && other.deserializeAttachment().role === 'host') { ws.close(1008, 'Host already connected'); return; }
        }
        a.role = 'host'; a.userId = account.userId;
        ws.serializeAttachment(a); ws.send(JSON.stringify({ type: 'ready', id: a.id }));
        return;
      }
      if (msg.role !== 'guest') { ws.close(1008, 'Invalid invite'); return; }
      const member = await this.ctx.storage.get(`member:${account.userId}`);
      if (!member && msg.joinHash !== saved.joinHash) { ws.close(1008, 'Invalid invite'); return; }
      const host = this.host();
      if (!host) { ws.close(1013, 'Host is offline'); return; }
      if (!member) await this.ctx.storage.put(`member:${account.userId}`, { admittedAt: Date.now(), owner: false });
      a.role = 'guest'; a.userId = account.userId; ws.serializeAttachment(a);
      ws.send(JSON.stringify({ type: 'ready', id: a.id }));
      host.send(JSON.stringify({ type: 'join', id: a.id }));
      return;
    }
    ws.serializeAttachment(a);
    if (msg.type === 'ping') { ws.send('{"type":"pong"}'); return; }
    if (msg.type !== 'data' || typeof msg.payload !== 'string' || msg.payload.length > 90000) { ws.close(1008, 'Invalid control frame'); return; }
    if (a.role === 'guest') {
      const host = this.host();
      if (!host) { ws.close(1013, 'Host is offline'); return; }
      host.send(JSON.stringify({ type: 'data', id: a.id, payload: msg.payload }));
    } else if (ID.test(msg.id || '')) {
      const guest = this.ctx.getWebSockets().find(s => { const v = s.deserializeAttachment(); return v.role === 'guest' && v.id === msg.id; });
      guest?.send(JSON.stringify({ type: 'data', id: msg.id, payload: msg.payload }));
    }
  }

  host() { return this.ctx.getWebSockets().find(s => s.readyState === 1 && s.deserializeAttachment().role === 'host'); }
  webSocketClose(ws) {
    const a = ws.deserializeAttachment();
    if (a.role === 'host') { for (const s of this.ctx.getWebSockets()) if (s !== ws) s.close(1013, 'Host disconnected'); }
    else if (a.role === 'guest') this.host()?.send(JSON.stringify({ type: 'leave', id: a.id }));
  }
  webSocketError(ws) { ws.close(1011, 'Connection error'); this.webSocketClose(ws); }
  async alarm() {
    for (const ws of this.ctx.getWebSockets()) { const a = ws.deserializeAttachment(); if (!a.role) ws.close(1008, 'Authentication timed out'); }
  }
}
