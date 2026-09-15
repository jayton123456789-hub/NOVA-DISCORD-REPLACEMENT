import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import App from './App';

// One promise per process also prevents React StrictMode from installing twice.
let startup: Promise<void> | undefined;
export function runStartupUpdate(status: (message: string) => void) {
  return startup ??= (async () => {
    const version = await invoke<string | null>('check_update');
    if (version) {
      status(`Downloading NOVA ${version}…`);
      await invoke('install_update');
    }
  })();
}
export default function UpdateGate() {
  const native = '__TAURI_INTERNALS__' in window;
  const [ready, setReady] = useState(!native);
  const [status, setStatus] = useState('Checking for updates…');
  const [available, setAvailable] = useState<string | null>(null);
  useEffect(() => {
    if (!native) return;
    let active = true;
    const progress = listen<{downloaded: number; total?: number}>('nova-update-progress', e => {
      if (active) setStatus(e.payload.total ? `Downloading update… ${Math.round(e.payload.downloaded / e.payload.total * 100)}%` : 'Downloading update…');
    });
    runStartupUpdate(message => { if (active) setStatus(message); })
      .catch(() => {}) // An unavailable update service must never prevent startup.
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; void progress.then(unlisten => unlisten()); };
  }, [native]);
  useEffect(() => {
    if (!native || !ready) return;
    let alive = true;
    let checking = false;
    let last = Date.now();
    const check = async () => {
      if (checking || Date.now() - last < 30 * 60_000) return;
      checking = true; last = Date.now();
      try { const version = await invoke<string | null>('check_update'); if (alive) setAvailable(version); }
      catch { /* Keep the active app usable offline. */ }
      finally { checking = false; }
    };
    const timer = window.setInterval(check, 30 * 60_000 + Math.random() * 60_000);
    window.addEventListener('focus', check);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', check); };
  }, [native, ready]);
  if (!ready) return <main style={{padding: 64, color: '#dcecff', background: '#0a0d11', height: '100vh'}}>
    <h1>NOVA</h1><p role="status">{status}</p><button onClick={() => { invoke("skip_update").then(() => setReady(true)).catch(() => setStatus("Installing update…")); }}>Open NOVA now</button>
  </main>;
  return <>{available && <div role="status" style={{position:'fixed', zIndex:10000, top:36, right:16, padding:12, background:'#142536', color:'white'}}>
    NOVA {available} is available. Close and reopen NOVA when you’re ready to update.
  </div>}<App /></>;
}
