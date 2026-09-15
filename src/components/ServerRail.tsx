import { Plus, Settings } from 'lucide-react';
import type { ConnectionConfig } from '../types';

type Props = { current: ConnectionConfig; saved: ConnectionConfig[]; onSwitch: (c: ConnectionConfig) => void; onAdd: () => void; onSettings: () => void; };
export default function ServerRail({ current, saved, onSwitch, onAdd, onSettings }: Props) {
  return <aside className="server-rail">
    <div className="brand-button"><img src="/nova-logo.webp" alt="NOVA"/></div>
    <div className="rail-line"/>
    <div className="server-list">{saved.map((s) => <button key={`${s.host}:${s.port}/${s.token}`} className={s.host === current.host && s.port === current.port && s.token === current.token ? 'active' : ''} onClick={() => onSwitch(s)} title={s.label || s.host}><span>{(s.label || s.host).slice(0,2).toUpperCase()}</span><i/></button>)}</div>
    <button className="rail-action" onClick={onAdd} title="Add or host a space"><Plus size={19}/></button>
    <div className="rail-spacer"/>
    <button className="rail-action" onClick={onSettings} title="Settings"><Settings size={18}/></button>
  </aside>;
}
