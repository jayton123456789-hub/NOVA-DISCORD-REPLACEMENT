import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import TitleBar from './components/TitleBar';
import ConnectScreen from './components/ConnectScreen';
import ServerRail from './components/ServerRail';
import ChannelSidebar from './components/ChannelSidebar';
import Chat from './components/Chat';
import MemberPanel from './components/MemberPanel';
import VoiceDock from './components/VoiceDock';
import VoiceStage from './components/VoiceStage';
import SharedFilesDrawer from './components/SharedFilesDrawer';
import SettingsDrawer from './components/SettingsDrawer';
import CreateChannelModal from './components/CreateChannelModal';
import type { Channel, ConnectionConfig, HostStatus, SharedFile } from './types';
import { inviteString } from './lib/connection';
import { useNovaConnection } from './hooks/useNovaConnection';
import { useVoice } from './hooks/useVoice';

function loadSaved(): ConnectionConfig[] { try { return JSON.parse(localStorage.getItem('nova.spaces') || '[]'); } catch { return []; } }

export default function App(){
  const[username,setUsernameState]=useState(()=>localStorage.getItem('nova.name')||'');
  const[config,setConfig]=useState<ConnectionConfig|null>(null);
  const[saved,setSaved]=useState<ConnectionConfig[]>(loadSaved);
  const[hostStatus,setHostStatus]=useState<HostStatus|null>(null);
  const[activeChannel,setActiveChannel]=useState('');
  const[voiceChannel,setVoiceChannel]=useState<string|null>(null);
  const[membersOpen,setMembersOpen]=useState(true);
  const[filesOpen,setFilesOpen]=useState(false);
  const[settingsOpen,setSettingsOpen]=useState(false);
  const[createOpen,setCreateOpen]=useState(false);
  const[showConnect,setShowConnect]=useState(false);
  const[inviteOpen,setInviteOpen]=useState(false);
  const[reduceMotion,setReduceMotion]=useState(()=>localStorage.getItem('nova.reduceMotion')==='1');
  const nova=useNovaConnection(config,username);
  const voice=useVoice({selfId:nova.peerId,members:nova.members,voiceChannel,sendSignal:nova.sendSignal,onSignal:nova.onSignal,announceJoin:nova.joinVoice,announceLeave:nova.leaveVoice});

  useEffect(()=>{ if(!activeChannel){const first=nova.channels.find((c)=>c.kind==='text');if(first)setActiveChannel(first.id)} },[nova.channels,activeChannel]);
  useEffect(()=>{document.documentElement.classList.toggle('reduce-motion',reduceMotion);localStorage.setItem('nova.reduceMotion',reduceMotion?'1':'0')},[reduceMotion]);
  useEffect(()=>{localStorage.setItem('nova.name',username)},[username]);
  useEffect(()=>{if(nova.status==='error')console.warn(nova.error)},[nova.status,nova.error]);
  const active=nova.channels.find((c)=>c.id===activeChannel)||null;
  const voiceName=nova.channels.find((c)=>c.id===voiceChannel)?.name;
  const voiceMembers=voiceChannel?nova.members.filter((m)=>m.voice_channel===voiceChannel):[];
  const typing=(nova.typing[activeChannel]||[]).map((x)=>x.split(':').slice(1).join(':')).filter((x)=>x&&x!==username);

  function setUsername(v:string){const n=v.trim().slice(0,28);if(n)setUsernameState(n)}
  function saveSpace(c:ConnectionConfig){const key=`${c.host}:${c.port}/${c.token}`;const next=[c,...saved.filter((s)=>`${s.host}:${s.port}/${s.token}`!==key)].slice(0,12);setSaved(next);localStorage.setItem('nova.spaces',JSON.stringify(next));}
  function connect(c:ConnectionConfig,host?:HostStatus){setConfig(c);saveSpace(c);setHostStatus(host||null);setShowConnect(false);}
  async function disconnect(){voice.leave();setVoiceChannel(null);nova.disconnect();setConfig(null);setHostStatus(null);setActiveChannel('');}
  async function selectChannel(c:Channel){if(c.kind==='text'){setActiveChannel(c.id);return;}try{if(voiceChannel===c.id)return;await voice.join(c.id);setVoiceChannel(c.id);}catch(e){alert(`Could not join voice: ${String(e)}`)}}
  async function uploadForChat(f:File){if(!activeChannel)throw new Error('Open a text channel first.');return nova.uploadFile(f,activeChannel)}
  async function uploadShared(f:File){return nova.uploadFile(f,activeChannel||'general')}
  const invite=hostStatus?.invite||(config?inviteString(config):'');

  if(!config||showConnect)return <div className="app"><TitleBar/><ConnectScreen username={username} setUsername={setUsername} onConnect={connect}/></div>;
  return <div className="app"><TitleBar/><div className="social-shell">
    <ServerRail current={config} saved={saved} onSwitch={(c)=>{voice.leave();setVoiceChannel(null);setConfig(c);}} onAdd={()=>setShowConnect(true)} onSettings={()=>setSettingsOpen(true)}/>
    <ChannelSidebar spaceName={nova.spaceName||config.label||'NOVA'} channels={nova.channels} activeId={activeChannel} members={nova.members} voiceChannel={voiceChannel} hostStatus={hostStatus} invite={invite} onChannel={selectChannel} onCreate={()=>setCreateOpen(true)} onDisconnect={disconnect} onInvite={()=>setInviteOpen((v)=>!v)} voiceControls={<VoiceDock connected={!!voiceChannel} channelName={voiceName} muted={voice.muted} cameraOn={voice.cameraOn} sharing={voice.sharing} onMute={voice.toggleMute} onCamera={()=>voice.toggleCamera().catch((e)=>alert(String(e)))} onShare={()=>voice.startShare().catch((e)=>alert(String(e)))} onLeave={()=>{voice.leave();setVoiceChannel(null)}}/>}/>
    <div className="center-stack">{voiceChannel&&<VoiceStage channelName={voiceName||'Voice'} selfId={nova.peerId} members={voiceMembers} remoteStreams={voice.remoteStreams} localPreview={voice.localPreview} muted={voice.muted} deafened={voice.deafened} cameraOn={voice.cameraOn} sharing={voice.sharing} mediaNote={voice.mediaNote} onMute={voice.toggleMute} onDeafen={()=>voice.setDeafened(!voice.deafened)} onCamera={()=>voice.toggleCamera().catch((e)=>alert(String(e)))} onShare={()=>voice.startShare().catch((e)=>alert(String(e)))} onLeave={()=>{voice.leave();setVoiceChannel(null)}} onOverlay={voice.setOverlayPosition}/>}<Chat channel={active} messages={nova.messages} username={username} typingNames={typing} fileUrl={nova.fileUrl} onSend={(t,f)=>nova.sendMessage(activeChannel,t,f)} onTyping={(a)=>nova.setTyping(activeChannel,a)} onUpload={uploadForChat} onOpenFiles={()=>setFilesOpen(true)} membersOpen={membersOpen} onMembers={()=>setMembersOpen((v)=>!v)}/></div>
    {membersOpen&&<MemberPanel members={nova.members}/>} 
  </div>
  {nova.status!=='online'&&<div className="connection-banner">{nova.status==='connecting'?'RECONNECTING TO SPACE…':nova.error||'OFFLINE'}</div>}
  {inviteOpen&&<div className="invite-pop"><span className="eyebrow">INVITE</span><b>Send this to the homies</b><input readOnly value={invite}/><button onClick={()=>navigator.clipboard.writeText(invite).catch(()=>{})}>COPY INVITE</button><small>LAN works directly. Remote friends can use your Tailscale IP in the invite.</small></div>}
  <SharedFilesDrawer open={filesOpen} list={nova.listFiles} upload={uploadShared} fileUrl={nova.fileUrl} onClose={()=>setFilesOpen(false)}/>
  <SettingsDrawer open={settingsOpen} username={username} onUsername={setUsername} reduceMotion={reduceMotion} onReduceMotion={setReduceMotion} onClose={()=>setSettingsOpen(false)}/>
  <CreateChannelModal open={createOpen} onClose={()=>setCreateOpen(false)} onCreate={(name,kind)=>nova.createChannel(name,kind)}/>
  </div>;
}
