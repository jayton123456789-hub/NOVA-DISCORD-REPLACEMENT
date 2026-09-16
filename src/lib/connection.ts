import type { ConnectionConfig } from '../types';

export function parseInvite(raw: string): ConnectionConfig {
  let value = raw.trim();
  if (!value) throw new Error('Paste an invite first.');
  if (value.startsWith('nova://space/')) {
    const url = new URL(value);
    const spaceId = url.pathname.slice(1);
    const token = url.hash.slice(1);
    const relay = new URL(url.searchParams.get('relay') || '');
    if (!/^[a-f0-9-]{36}$/.test(spaceId) || !/^[a-f0-9]{64}$/.test(token) || relay.username || relay.password || relay.search || relay.hash || relay.pathname !== '/' || (relay.protocol !== 'https:' && !(relay.protocol === 'http:' && ['127.0.0.1','localhost'].includes(relay.hostname)))) throw new Error('Invalid internet invite');
    return { host: relay.hostname, port: Number(relay.port || 443), token, spaceId, relayUrl: relay.origin };
  }
  value = value.replace(/^nova:\/\//i, '').replace(/^https?:\/\//i, '').replace(/^wss?:\/\//i, '');
  const [hostPort, token] = value.split('/');
  if (!hostPort || !token) throw new Error('Invite should look like nova://HOST:38765/TOKEN');
  const lastColon = hostPort.lastIndexOf(':');
  if (lastColon < 1) throw new Error('Invite is missing a port.');
  const host = hostPort.slice(0, lastColon).trim();
  const port = Number(hostPort.slice(lastColon + 1));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invite address is invalid.');
  return { host, port, token: token.trim() };
}

export function inviteString(c: ConnectionConfig) {
  if(c.relayUrl && c.spaceId) return `nova://space/${c.spaceId}?relay=${encodeURIComponent(c.relayUrl)}#${c.token}`;
  return `nova://${c.host}:${c.port}/${c.token}`;
}

export function httpBase(c: ConnectionConfig) {
  return `http://${c.host}:${c.port}`;
}

export function wsAddress(c: ConnectionConfig, name: string) {
  return `ws://${c.host}:${c.port}/ws?token=${encodeURIComponent(c.token)}&name=${encodeURIComponent(name)}`;
}

export function colorFromName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 58% 64%)`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n >= 100 ? n.toFixed(0) : n.toFixed(1)} ${units[i]}`;
}
