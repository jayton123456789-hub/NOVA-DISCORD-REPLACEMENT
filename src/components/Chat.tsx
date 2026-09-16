import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileUp, FolderOpen, Hash, Menu, Paperclip, Search, Send, Users } from 'lucide-react';
import type { Channel, ChatMessage, SharedFile } from '../types';
import { colorFromName, formatBytes } from '../lib/connection';

type Props = { connected: boolean; spaceKey: string; onCreate: () => void; channel: Channel | null; messages: ChatMessage[]; username: string; typingNames: string[]; fileUrl: (id: string) => string; onSend: (text: string, file?: SharedFile|null) => Promise<void>; onTyping: (active: boolean) => void; onUpload: (f: File) => Promise<SharedFile>; onOpenFiles: () => void; membersOpen: boolean; onMembers: () => void; };

export default function Chat(p: Props) {
  const draftKey = `nova.draft:${p.spaceKey}:${p.channel?.id || ''}`;
  const [text,setText]=useState('');
  const [sendError,setSendError]=useState('');
  const [sending,setSending]=useState(false);
  useEffect(()=>{setText(localStorage.getItem(draftKey)||'');setSendError('');},[draftKey]); const [search,setSearch]=useState(''); const [uploading,setUploading]=useState(false); const inputFile=useRef<HTMLInputElement>(null); const scroller=useRef<HTMLDivElement>(null); const typingTimer=useRef<number|null>(null);
  useEffect(()=>{ scroller.current?.scrollTo({top:scroller.current.scrollHeight}); },[p.messages.length,p.channel?.id]);
  const shown=useMemo(()=>{ const q=search.trim().toLowerCase(); return p.messages.filter((m)=>m.channel_id===p.channel?.id && (!q || m.body.toLowerCase().includes(q) || m.author.toLowerCase().includes(q))); },[p.messages,p.channel?.id,search]);
  async function submit(){ const body=text.trim(); if(!body||sending)return; setSending(true);setSendError('');try{await p.onSend(body);setText('');localStorage.removeItem(draftKey);p.onTyping(false);}catch(e){setSendError(String(e));}finally{setSending(false);} }
  function type(v:string){ setText(v); localStorage.setItem(draftKey,v); p.onTyping(true); if(typingTimer.current)window.clearTimeout(typingTimer.current); typingTimer.current=window.setTimeout(()=>p.onTyping(false),1400); }
  async function upload(file:File){ setUploading(true); try{ const f=await p.onUpload(file); await p.onSend('',f); } finally{ setUploading(false); } }
  if(!p.channel || p.channel.kind!=='text') return <main className="chat-pane empty-chat"><div><Hash size={34}/><h2>Your Space, your channels</h2><p>Create your own text and voice channels, or choose one from the sidebar.</p><button disabled={!p.connected} onClick={p.onCreate}>Create a channel</button></div></main>;
  return <main className="chat-pane">
    <header className="chat-header"><div className="chat-title"><Hash size={19}/><strong>{p.channel.name}</strong></div><div className="chat-actions"><label className="search-box"><Search size={14}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search"/></label><button onClick={p.onOpenFiles} title="Shared files"><FolderOpen size={17}/></button><button className={p.membersOpen?'active':''} onClick={p.onMembers} title="Members"><Users size={18}/></button></div></header>
    <div className="channel-intro"><span>#</span><div><h2>{p.channel.name}</h2><p>Start of #{p.channel.name}. Keep it useful or at least funny.</p></div></div>
    <div className="messages" ref={scroller}>{shown.map((m)=><article className="message" key={m.id}><div className="avatar" style={{background:colorFromName(m.author)}}>{m.author.slice(0,1).toUpperCase()}</div><div className="message-content"><header><strong style={{color:colorFromName(m.author)}}>{m.author}</strong><time>{new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time></header>{m.body&&<p>{m.body}</p>}{m.attachment&&<a className="file-attachment" href={p.fileUrl(m.attachment.id)} target="_blank" rel="noreferrer"><FileUp size={20}/><span><b>{m.attachment.name}</b><small>{formatBytes(m.attachment.size)}</small></span><Download size={16}/></a>}</div></article>)}</div>
    <div className="composer-area">{sendError&&<div className="composer-error" role="alert">{sendError}</div>}{p.typingNames.length>0&&<div className="typing"><i/><i/><i/><span>{p.typingNames.join(', ')} {p.typingNames.length===1?'is':'are'} typing</span></div>}<div className="composer"><input ref={inputFile} type="file" hidden onChange={(e)=>{const f=e.target.files?.[0]; if(f)upload(f).catch((err)=>alert(String(err))); e.currentTarget.value='';}}/><button disabled={uploading||!p.connected} onClick={()=>inputFile.current?.click()} title="Attach file"><Paperclip size={18}/></button><textarea disabled={sending} rows={1} value={text} onChange={(e)=>type(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit();}}} placeholder={`Message #${p.channel.name}`}/><button className="send" disabled={!text.trim()||sending||!p.connected} onClick={submit}><Send size={16}/></button></div></div>
  </main>;
}
