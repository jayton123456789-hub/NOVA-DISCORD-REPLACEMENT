import { invoke } from '@tauri-apps/api/core';
import { ServiceError, serviceEndpoint, serviceRequest } from './service';

export type NovaUser = {
  id: string;
  email: string;
  name: string;
  picture?: string | null;
};

export type DeviceIdentity = {
  version: 1;
  deviceId: string;
  createdAt: number;
  signingPublicKey: JsonWebKey;
  signingPrivateKey: JsonWebKey;
  encryptionPublicKey: JsonWebKey;
  encryptionPrivateKey: JsonWebKey;
};

export type AccountSession = {
  token: string;
  user: NovaUser;
  device: DeviceIdentity;
  offline: boolean;
};

type CompleteResponse = { session: string; user: NovaUser; expiresAt: number };
type BrowserLogin = { ticket: string };
const SESSION_KEY = 'account-session-v2';
type SavedSession = { version: 2; token: string; user: NovaUser; expiresAt: number };
let restoreInFlight: Promise<AccountSession | null> | null = null;
const PROFILE_KEY = 'account-profile';

const native = () => '__TAURI_INTERNALS__' in window;
async function loadSecret(key: string) { return native() ? invoke<string | null>('load_secure_secret', { key }) : null; }
async function saveSecret(key: string, value: string) { if (native()) await invoke('save_secure_secret', { key, value }); }
async function deleteSecret(key: string) { if (native()) await invoke('delete_secure_secret', { key }); }

async function generateDevice(): Promise<DeviceIdentity> {
  const signing = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const encryption = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits', 'deriveKey']) as CryptoKeyPair;
  return {
    version: 1,
    deviceId: crypto.randomUUID(),
    createdAt: Date.now(),
    signingPublicKey: await crypto.subtle.exportKey('jwk', signing.publicKey),
    signingPrivateKey: await crypto.subtle.exportKey('jwk', signing.privateKey),
    encryptionPublicKey: await crypto.subtle.exportKey('jwk', encryption.publicKey),
    encryptionPrivateKey: await crypto.subtle.exportKey('jwk', encryption.privateKey),
  };
}

export async function ensureDeviceIdentity(userId: string): Promise<DeviceIdentity> {
  const key = `device-identity-${userId}`;
  const saved = await loadSecret(key);
  if (saved) {
    const value = JSON.parse(saved) as DeviceIdentity;
    if (value?.version === 1 && typeof value.deviceId === 'string' && value.signingPrivateKey && value.encryptionPrivateKey) return value;
  }
  const device = await generateDevice();
  await saveSecret(key, JSON.stringify(device));
  return device;
}

async function registerDevice(session: string, device: DeviceIdentity) {
  await serviceRequest('/v1/devices/register', {
    method: 'POST',
    body: JSON.stringify({
      deviceId: device.deviceId,
      deviceName: navigator.userAgent.includes('Windows') ? 'Windows PC' : 'NOVA device',
      signingPublicKey: device.signingPublicKey,
      encryptionPublicKey: device.encryptionPublicKey,
    }),
  }, session);
}

export function restoreAccount(): Promise<AccountSession | null> {
  if (!restoreInFlight) restoreInFlight = restoreSavedAccount().finally(() => { restoreInFlight = null; });
  return restoreInFlight;
}

async function restoreSavedAccount(): Promise<AccountSession | null> {
  if (!serviceEndpoint || !native()) return null;
  const raw = await loadSecret(SESSION_KEY);
  if (!raw) return null;
  const saved = JSON.parse(raw) as SavedSession;
  if (saved.version !== 2 || !/^[a-f0-9]{64}$/.test(saved.token) || !saved.user?.id || !Number.isFinite(saved.expiresAt)) throw new Error('Saved account data is invalid. It has been preserved.');
  if (saved.expiresAt <= Date.now()) { await deleteSecret(SESSION_KEY); return null; }
  try {
    const user = await serviceRequest<NovaUser>('/v1/account/me', {}, saved.token);
    if (user.id !== saved.user.id) throw new Error('Saved account identity does not match its session.');
    const device = await ensureDeviceIdentity(user.id);
    await registerDevice(saved.token, device);
    await saveSecret(SESSION_KEY, JSON.stringify({ ...saved, user }));
    return { token: saved.token, user, device, offline: false };
  } catch (error) {
    if (error instanceof ServiceError && error.status === 401) { await deleteSecret(SESSION_KEY); return null; }
    if (error instanceof ServiceError && (error.status === 0 || error.status >= 500)) {
      return { token: saved.token, user: saved.user, device: await ensureDeviceIdentity(saved.user.id), offline: true };
    }
    throw error;
  }
}

export async function signInWithGoogle(): Promise<AccountSession> {
  if (!native()) throw new Error('Google sign-in is available in the installed NOVA app.');
  if (!serviceEndpoint) throw new Error('This NOVA build is missing its production service endpoint.');
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
  const login = await invoke<BrowserLogin>('begin_google_login', { serviceUrl: serviceEndpoint, challenge });
  const completed = await serviceRequest<CompleteResponse>('/v1/auth/complete', { method: 'POST', body: JSON.stringify({ ticket: login.ticket, verifier }) });

  const device = await ensureDeviceIdentity(completed.user.id);
  await registerDevice(completed.session, device);
  await saveSecret(SESSION_KEY, JSON.stringify({ version: 2, token: completed.session, user: completed.user, expiresAt: completed.expiresAt } satisfies SavedSession));
  return { token: completed.session, user: completed.user, device, offline: false };
}

export async function signOut(session?: string) {
  if (session && serviceEndpoint) await serviceRequest('/v1/auth/logout', { method: 'POST' }, session).catch(() => {});
  await deleteSecret(SESSION_KEY);
  await deleteSecret(PROFILE_KEY);
  await deleteSecret('account-session');
}

export function developmentAccount(): AccountSession {
  return {
    token: 'local-development',
    user: { id: 'local-development', email: 'local@nova.invalid', name: 'Local Developer' },
    device: { version: 1, deviceId: 'local-development', createdAt: 0, signingPublicKey: {}, signingPrivateKey: {}, encryptionPublicKey: {}, encryptionPrivateKey: {} },
    offline: true,
  };
}
