import { invoke } from '@tauri-apps/api/core';
import type { ConnectionConfig } from '../types';

export type Workspace = { version: 2; username: string; current: ConnectionConfig | null; spaces: ConnectionConfig[]; channel: string };
export function emptyWorkspace(): Workspace { return { version: 2, username: '', current: null, spaces: [], channel: '' }; }

function validConfig(value: any): value is ConnectionConfig {
  return !!value && typeof value.host === 'string' && Number.isInteger(value.port) && value.port > 0 && value.port < 65536 && typeof value.token === 'string' && !!value.token;
}
export async function loadWorkspace(accountId: string): Promise<Workspace> {
  const raw = await invoke<string | null>('load_workspace', { accountId });
  if (!raw) return emptyWorkspace();
  const value = JSON.parse(raw);
  if (value.version !== 2 || typeof value.username !== 'string' || !Array.isArray(value.spaces) || !value.spaces.every(validConfig) || (value.current !== null && !validConfig(value.current))) {
    throw new Error('Saved workspace could not be read. Your data has been preserved.');
  }
  return { ...value, channel: typeof value.channel === 'string' ? value.channel : '' };
}

// Serialize writes so a slower older save can never overwrite a newer one.
let writes: Promise<unknown> = Promise.resolve();
export function saveWorkspace(accountId: string, value: Workspace): Promise<unknown> {
  writes = writes.catch(() => {}).then(() => invoke('save_workspace', { accountId, value: JSON.stringify(value) }));
  return writes;
}
