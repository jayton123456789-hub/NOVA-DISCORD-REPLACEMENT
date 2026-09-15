import type { ConnectionConfig } from '../types';

export function parseInvite(raw: string): ConnectionConfig {
  let value = raw.trim();
  if (!value) throw new Error('Paste an invite first.');
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
