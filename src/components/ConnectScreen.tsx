import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowRight, RadioTower, UsersRound } from 'lucide-react';
import type { ConnectionConfig, HostStatus } from '../types';
import { parseInvite } from '../lib/connection';

type Props = { username: string; setUsername: (v: string) => void; onConnect: (c: ConnectionConfig, host?: HostStatus) => void; };

export default function ConnectScreen({ username, setUsername, onConnect }: Props) {
  const [space, setSpace] = useState('The Homies');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function host() {
    if (!username.trim()) { setError('Pick a display name first.'); return; }
    setBusy(true); setError('');
    try {
      const status = await invoke<HostStatus>('start_host', { spaceName: space.trim() || 'NOVA Space', port: 38765 });
      onConnect({ host: '127.0.0.1', port: status.port, token: status.token, label: status.space_name }, status);
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  function join() {
    if (!username.trim()) { setError('Pick a display name first.'); return; }
    try { setError(''); onConnect(parseInvite(invite)); } catch (e) { setError(String(e)); }
  }

  return <main className="connect-screen">
    <div className="connect-atmosphere"/>
    <section className="connect-brand"><img src="/nova-logo.webp"/><span>PRIVATE SOCIAL FOR PEOPLE YOU ACTUALLY KNOW</span><h1>Talk. Share. Build.<br/>Without the bloat.</h1><p>NOVA v1 is a lightweight friend-group chat with real channels, voice, camera, screen sharing, system audio and shared project files.</p></section>
    <section className="connect-panel">
      <label className="field-label">YOUR NAME<input value={username} maxLength={28} onChange={(e) => setUsername(e.target.value)} placeholder="Jayton"/></label>
      <div className="connect-split">
        <div className="connect-option"><div className="option-icon"><RadioTower/></div><span className="eyebrow">HOST</span><h2>Start a space</h2><p>Your PC becomes the NOVA host. Friends join with the invite.</p><label>SPACE NAME<input value={space} maxLength={40} onChange={(e) => setSpace(e.target.value)}/></label><button disabled={busy} onClick={host}>{busy ? 'STARTING…' : 'HOST SPACE'}<ArrowRight size={15}/></button></div>
        <div className="connect-option"><div className="option-icon"><UsersRound/></div><span className="eyebrow">JOIN</span><h2>Use an invite</h2><p>Paste the invite your friend sent you.</p><label>INVITE<input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="nova://192.168.1.20:38765/…"/></label><button onClick={join}>JOIN SPACE<ArrowRight size={15}/></button></div>
      </div>
      {error && <div className="connect-error">{error}</div>}
      <small className="network-note">Same network works immediately. For friends outside your house, use the host's Tailscale IP or forward TCP port 38765.</small>
    </section>
  </main>;
}
