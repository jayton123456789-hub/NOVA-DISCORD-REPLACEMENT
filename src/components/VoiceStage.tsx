import { useEffect, useRef } from 'react';
import { Camera, CameraOff, Headphones, Mic, MicOff, MonitorUp, PhoneOff } from 'lucide-react';
import RemoteAudio from './RemoteAudio';
import type { Member } from '../types';
import { colorFromName } from '../lib/connection';

function MediaTile({ stream, name, muted=false, local=false, onPoint }: { stream: MediaStream|null; name:string; muted?:boolean; local?:boolean; onPoint?:(x:number,y:number)=>void }){
  const ref=useRef<HTMLVideoElement>(null);

  const hasVideo=!!stream?.getVideoTracks().some((t)=>t.readyState==='live');
  useEffect(() => { const video = ref.current; if (!video) return; video.srcObject = stream; return () => { video.pause(); video.srcObject = null; }; }, [stream, hasVideo]);
  return <div className={`media-tile ${hasVideo?'has-video':''}`} onPointerDown={(e)=>{if(!onPoint)return; const r=e.currentTarget.getBoundingClientRect(); onPoint((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);}} onPointerMove={(e)=>{if(!onPoint||e.buttons!==1)return; const r=e.currentTarget.getBoundingClientRect(); onPoint((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);}}>{hasVideo?<video ref={ref} autoPlay playsInline muted/>:<div className="media-avatar" style={{background:colorFromName(name)}}>{name.slice(0,1).toUpperCase()}</div>}{!local && <RemoteAudio stream={stream} muted={muted} name={name}/>}<span>{local?'You':name}</span></div>;
}

type Props={channelName:string; selfId:string; members:Member[]; remoteStreams:Record<string,MediaStream>; localPreview:MediaStream|null; muted:boolean; deafened:boolean; cameraOn:boolean; sharing:boolean; mediaNote:string; onMute:()=>void; onDeafen:()=>void; onCamera:()=>void; onShare:()=>void; onLeave:()=>void; onOverlay:(x:number,y:number)=>void;};
export default function VoiceStage(p:Props){ const peers=p.members.filter((m)=>m.voice_channel&&m.peer_id!==p.selfId); return <section className="voice-stage"><header><div><span>VOICE CHANNEL</span><strong>{p.channelName}</strong></div><div className="call-status"><i/>LIVE CALL · {peers.length+1}</div></header><div className="media-grid"><MediaTile stream={p.localPreview} name="You" local muted onPoint={p.sharing&&p.cameraOn?p.onOverlay:undefined}/>{peers.map((m)=><MediaTile key={m.peer_id} stream={p.remoteStreams[m.peer_id]||null} name={m.name} muted={p.deafened}/>)}</div>{p.mediaNote&&<div className="media-note">{p.mediaNote}</div>}<footer className="call-controls"><button className={p.muted?'danger active':''} onClick={p.onMute}>{p.muted?<MicOff/>:<Mic/>}<span>{p.muted?'Unmute':'Mute'}</span></button><button className={p.deafened?'active':''} onClick={p.onDeafen}><Headphones/><span>Deafen</span></button><button className={p.cameraOn?'active':''} onClick={p.onCamera}>{p.cameraOn?<Camera/>:<CameraOff/>}<span>Camera</span></button><button className={p.sharing?'active blue':''} onClick={p.onShare}><MonitorUp/><span>{p.sharing?'Stop share':'Share screen'}</span></button><button className="hangup" onClick={p.onLeave}><PhoneOff/><span>Leave</span></button></footer></section>; }
