import type { ReactNode } from 'react';
import { Copy, Hash, LogOut, Plus, Radio, Volume2 } from 'lucide-react';
import type { Channel, HostStatus, Member } from '../types';

type Props = { spaceName: string; channels: Channel[]; activeId: string; members: Member[]; voiceChannel: string | null; hostStatus: HostStatus | null; invite: string; onChannel: (c: Channel) => void; onCreate: () => void; onDisconnect: () => void; onInvite: () => void; voiceControls: ReactNode; };
export default function ChannelSidebar(p: Props) {
  const text = p.channels.filter((c) => c.kind === 'text'); const voice = p.channels.filter((c) => c.kind === 'voice');
  return <aside className="channel-sidebar">
    <header className="space-header"><div><span>SPACE</span><h1>{p.spaceName || 'NOVA'}</h1></div><button onClick={p.onInvite} title="Copy invite"><Copy size={15}/></button></header>
    <div className="channel-scroll">
      <section className="channel-group"><header><span>TEXT CHANNELS</span><button onClick={p.onCreate}><Plus size={13}/></button></header>{text.map((c) => <button key={c.id} className={`channel ${p.activeId === c.id ? 'active' : ''}`} onClick={() => p.onChannel(c)}><Hash size={16}/><span>{c.name}</span></button>)}</section>
      <section className="channel-group"><header><span>VOICE</span><button onClick={p.onCreate}><Plus size={13}/></button></header>{voice.map((c) => { const count=p.members.filter((m)=>m.voice_channel===c.id).length; return <button key={c.id} className={`channel voice ${p.voiceChannel === c.id ? 'active' : ''}`} onClick={() => p.onChannel(c)}><Volume2 size={16}/><span>{c.name}</span>{count>0 && <b>{count}</b>}</button>; })}</section>
    </div>
    {p.voiceControls}
    <footer className="sidebar-footer"><span><i className="online-dot"/>CONNECTED</span><button onClick={p.onDisconnect} title="Disconnect"><LogOut size={14}/></button></footer>
  </aside>;
}
