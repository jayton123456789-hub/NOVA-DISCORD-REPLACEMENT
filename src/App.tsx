import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { relayEndpoint, startInternetHost } from './lib/relay';
import { developmentAccount, restoreAccount, signInWithGoogle, signOut, type AccountSession } from './lib/account';
import InviteDialog from './components/InviteDialog';
import LoginScreen from './components/LoginScreen';
import { loadWorkspace, saveWorkspace, type Workspace } from './lib/workspace';
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

const native = () => '__TAURI_INTERNALS__' in window;

export default function App() {
  const [account, setAccount] = useState<AccountSession | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const restore = useCallback(() => {
    setError('');
    restoreAccount().then(setAccount).catch(e => { setError(String(e)); setAccount(null); });
  }, []);
  useEffect(restore, [restore]);

  if (account === undefined) return <div className="app"><TitleBar/><main className="empty-chat"><h2>Opening your NOVA account...</h2></main></div>;
  if (!account) {
    const google = async () => {
      setBusy(true); setError('');
      try { setAccount(await signInWithGoogle()); }
      catch (e) { setError(String(e)); }
      finally { setBusy(false); }
    };
    return <div className="app"><TitleBar/><LoginScreen busy={busy} error={error} onGoogle={google} onDevelopment={!native() ? () => setAccount(developmentAccount()) : undefined}/></div>;
  }
  return <WorkspaceApp key={account.user.id} account={account} onAccountChanged={setAccount}/>;
}

function WorkspaceApp({ account, onAccountChanged }: { account: AccountSession; onAccountChanged: (value: AccountSession | null) => void }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); loadWorkspace(account.user.id).then(setWorkspace).catch(e => setError(String(e))); }, [account.user.id]);
  useEffect(load, [load]);
  if (!workspace) return <div className="app"><TitleBar/><main className="empty-chat"><h2>{error || 'Opening your workspace...'}</h2>{error && <button onClick={load}>Retry loading saved data</button>}</main></div>;
  return <SocialApp initial={workspace} account={account} onAccountChanged={onAccountChanged}/>;
}

function SocialApp({ initial, account, onAccountChanged }: { initial: Workspace; account: AccountSession; onAccountChanged: (value: AccountSession | null) => void }) {
  const[username,setUsernameState]=useState((initial.username || account.user.name).slice(0,28));
  const[config,setConfig]=useState<ConnectionConfig|null>(initial.current);
  const[saved,setSaved]=useState<ConnectionConfig[]>(initial.spaces);
  const[storageError,setStorageError]=useState('');
  const[internetStatus,setInternetStatus]=useState('');
  const[internetReady,setInternetReady]=useState(false);
  const[hostError,setHostError]=useState('');
  const[restoreAttempt,setRestoreAttempt]=useState(0);
  const[hostStatus,setHostStatus]=useState<HostStatus|null>(null);
  const[activeChannel,setActiveChannel]=useState(initial.channel);
  const[voiceChannel,setVoiceChannel]=useState<string|null>(null);
  const[membersOpen,setMembersOpen]=useState(true);
  const[filesOpen,setFilesOpen]=useState(false);
  const[settingsOpen,setSettingsOpen]=useState(false);
  const[createOpen,setCreateOpen]=useState(false);
  const[showConnect,setShowConnect]=useState(false);
  const[inviteOpen,setInviteOpen]=useState(false);
  const[reduceMotion,setReduceMotion]=useState(()=>localStorage.getItem('nova.reduceMotion')==='1');
  const hostReady = !config?.hostedSpaceId || hostStatus?.space_id === config.hostedSpaceId;
  const nova=useNovaConnection(hostReady ? config : null,username,account.token);
  const voice=useVoice({sessionToken:account.token,selfId:nova.peerId,members:nova.members,voiceChannel,sendSignal:nova.sendSignal,onSignal:nova.onSignal,announceJoin:nova.joinVoice,announceLeave:nova.leaveVoice});

  useEffect(() => {
    saveWorkspace(account.user.id, { version: 2, username, current: config, spaces: saved, channel: activeChannel })
      .then(() => setStorageError('')).catch(e => setStorageError(`Could not save settings: ${String(e)}`));
  }, [username, config, saved, activeChannel]);
  useEffect(() => {
    let alive = true;
    setHostError('');
    if (config?.hostedSpaceId) {
      invoke<HostStatus>('start_host', { spaceName: config.label || '', port: config.port, spaceId: config.hostedSpaceId })
        .then(h => { if (alive) setHostStatus(h); }).catch(e => { if (alive) setHostError(String(e)); });
    } else setHostStatus(null);
    return () => { alive = false; };
  }, [config?.hostedSpaceId, config?.port, config?.label, restoreAttempt]);
  useEffect(() => {
    if (!hostStatus) return;
    return startInternetHost(hostStatus, account.token, (text, ready) => { setInternetStatus(text); setInternetReady(ready); });
  }, [hostStatus, account.token]);
  const closeInvite = useCallback(() => setInviteOpen(false), []);
  useEffect(()=>{ if(!activeChannel){const first=nova.channels.find((c)=>c.kind==='text');if(first)setActiveChannel(first.id)} },[nova.channels,activeChannel]);
  useEffect(()=>{document.documentElement.classList.toggle('reduce-motion',reduceMotion);localStorage.setItem('nova.reduceMotion',reduceMotion?'1':'0')},[reduceMotion]);

  useEffect(()=>{if(nova.status==='error')console.warn(nova.error)},[nova.status,nova.error]);
  const active=nova.channels.find((c)=>c.id===activeChannel)||null;
  const voiceName=nova.channels.find((c)=>c.id===voiceChannel)?.name;
  const voiceMembers=voiceChannel?nova.members.filter((m)=>m.voice_channel===voiceChannel):[];
  const typing=(nova.typing[activeChannel]||[]).map((x)=>x.split(':').slice(1).join(':')).filter((x)=>x&&x!==username);

  function setUsername(v:string){setUsernameState(v.slice(0,28))}
  function saveSpace(c:ConnectionConfig){const key=`${c.host}:${c.port}/${c.token}`;const next=[c,...saved.filter((s)=>`${s.host}:${s.port}/${s.token}`!==key)].slice(0,12);setSaved(next);}
  function connect(c:ConnectionConfig,host?:HostStatus){setActiveChannel('');setConfig(c);saveSpace(c);setHostStatus(host||null);setShowConnect(false);}
  async function disconnect(){voice.leave();setVoiceChannel(null);nova.disconnect();if(hostStatus)await invoke('stop_host');setConfig(null);setHostStatus(null);setActiveChannel('');}
  async function logout(){await disconnect().catch(()=>{});await signOut(account.token);onAccountChanged(null);}
  async function selectChannel(c:Channel){if(nova.status!=='online'){alert('Connect to the Space before joining a channel.');return;}if(c.kind==='text'){setActiveChannel(c.id);return;}try{if(voiceChannel===c.id)return;await voice.join(c.id);setVoiceChannel(c.id);}catch(e){alert(`Could not join voice: ${String(e)}`)}}
  async function uploadForChat(f:File){if(!activeChannel)throw new Error('Open a text channel first.');return nova.uploadFile(f,activeChannel)}
  async function uploadShared(f:File){if(!activeChannel)throw new Error('Create and select a text channel first.');return nova.uploadFile(f,activeChannel)}
  const invite=hostStatus ? (internetReady ? inviteString({host:'',port:443,token:hostStatus.token,spaceId:hostStatus.space_id,relayUrl:relayEndpoint}) : hostStatus.invite) : (config?inviteString(config):'');

  if(!config||showConnect)return <div className="app"><TitleBar/><ConnectScreen username={username} setUsername={setUsername} onConnect={connect} onCancel={config?()=>setShowConnect(false):undefined}/>{account.offline&&<div className="connection-banner" role="status">NOVA account services are offline. Saved local data is still available.</div>}</div>;
  return <div className="app"><TitleBar/><div className="social-shell">
    <ServerRail current={config} saved={saved} onSwitch={(c)=>{voice.leave();setVoiceChannel(null);connect(c);}} onAdd={()=>setShowConnect(true)} onSettings={()=>setSettingsOpen(true)}/>
    <ChannelSidebar connected={nova.status==='online'} spaceName={nova.spaceName||config.label||'NOVA'} channels={nova.channels} activeId={activeChannel} members={nova.members} voiceChannel={voiceChannel} hostStatus={hostStatus} invite={invite} onChannel={selectChannel} onCreate={()=>setCreateOpen(true)} onDisconnect={disconnect} onInvite={()=>setInviteOpen((v)=>!v)} voiceControls={<VoiceDock connected={!!voiceChannel} channelName={voiceName} muted={voice.muted} cameraOn={voice.cameraOn} sharing={voice.sharing} onMute={voice.toggleMute} onCamera={()=>voice.toggleCamera().catch((e)=>alert(String(e)))} onShare={()=>voice.startShare().catch((e)=>alert(String(e)))} onLeave={()=>{voice.leave();setVoiceChannel(null)}}/>}/>
    <div className="center-stack">{voiceChannel&&<VoiceStage channelName={voiceName||'Voice'} selfId={nova.peerId} members={voiceMembers} remoteStreams={voice.remoteStreams} localPreview={voice.localPreview} muted={voice.muted} deafened={voice.deafened} cameraOn={voice.cameraOn} sharing={voice.sharing} mediaNote={voice.mediaNote} onMute={voice.toggleMute} onDeafen={()=>voice.setDeafened(!voice.deafened)} onCamera={()=>voice.toggleCamera().catch((e)=>alert(String(e)))} onShare={()=>voice.startShare().catch((e)=>alert(String(e)))} onLeave={()=>{voice.leave();setVoiceChannel(null)}} onOverlay={voice.setOverlayPosition}/>}<Chat connected={nova.status==='online'} spaceKey={`${account.user.id}:${config.spaceId || config.hostedSpaceId || `${config.host}:${config.port}`}`} onCreate={()=>setCreateOpen(true)} channel={active} messages={nova.messages} username={username} typingNames={typing} fileUrl={nova.fileUrl} onSend={(t,f)=>nova.sendMessage(activeChannel,t,f)} onTyping={(a)=>nova.setTyping(activeChannel,a)} onUpload={uploadForChat} onOpenFiles={()=>setFilesOpen(true)} membersOpen={membersOpen} onMembers={()=>setMembersOpen((v)=>!v)}/></div>
    {membersOpen&&<MemberPanel members={nova.members}/>} 
  </div>
  {(storageError || hostError || account.offline || nova.status!=='online')&&<div className="connection-banner" role="status">{storageError || hostError || (account.offline ? 'NOVA account services are offline; local access can continue.' : '') || (nova.status==='connecting'?'Connecting to your Space...':nova.error || 'Starting your saved Space...')} <button onClick={()=>{setRestoreAttempt(v=>v+1);nova.retry()}}>Retry</button></div>}
  {inviteOpen&&<InviteDialog internetStatus={hostStatus?internetStatus:config.relayUrl?'Internet invite':'Local network invite'} internetReady={hostStatus?internetReady:!!config.relayUrl} invite={invite} onClose={closeInvite}/>}
  <SharedFilesDrawer open={filesOpen} list={nova.listFiles} upload={uploadShared} fileUrl={nova.fileUrl} onClose={()=>setFilesOpen(false)}/>
  <SettingsDrawer open={settingsOpen} account={account.user} username={username} onUsername={setUsername} reduceMotion={reduceMotion} onReduceMotion={setReduceMotion} onSignOut={logout} onClose={()=>setSettingsOpen(false)}/>
  <CreateChannelModal open={createOpen} onClose={()=>setCreateOpen(false)} onCreate={(name,kind)=>nova.createChannel(name,kind)}/>
  </div>;
}
