import { Headphones, Mic, MonitorUp } from 'lucide-react';
import type { Member } from '../types';
import { colorFromName } from '../lib/connection';
export default function MemberPanel({ members }: { members: Member[] }) { return <aside className="member-panel"><header><span>PEOPLE</span><b>{members.length} ONLINE</b></header><div className="member-list">{members.map((m)=><div className="member" key={m.peer_id}><div className="member-avatar" style={{background:colorFromName(m.name)}}>{m.name.slice(0,1).toUpperCase()}<i/></div><div><strong>{m.name}</strong><span>{m.voice_channel?'In voice':'Online'}</span></div>{m.voice_channel&&<Headphones size={13}/>}</div>)}</div></aside>; }
