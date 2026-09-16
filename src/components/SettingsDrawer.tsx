import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Gauge, LogOut, Save, Shield, X } from 'lucide-react';
import type { RuntimeMetrics } from '../types';
import type { NovaUser } from '../lib/account';
import LegalDialog from './LegalDialog';

type Props={
  open:boolean;
  account:NovaUser;
  username:string;
  onUsername:(v:string)=>void;
  reduceMotion:boolean;
  onReduceMotion:(v:boolean)=>void;
  onSignOut:()=>Promise<void>;
  onClose:()=>void;
};

export default function SettingsDrawer(p:Props){
  const[draft,setDraft]=useState(p.username);
  const[metrics,setMetrics]=useState<RuntimeMetrics|null>(null);
  const[diag,setDiag]=useState('');
  const[signingOut,setSigningOut]=useState(false);
  const[legal,setLegal]=useState<'terms'|'privacy'|null>(null);
  useEffect(()=>setDraft(p.username),[p.username]);
  useEffect(()=>{
    if(!p.open)return;
    let alive=true;
    const run=()=>invoke<RuntimeMetrics>('get_runtime_metrics').then((m)=>alive&&setMetrics(m)).catch(()=>{});
    run(); const id=window.setInterval(run,2500);
    return()=>{alive=false;clearInterval(id)};
  },[p.open]);
  if(!p.open)return null;
  return <div className="drawer-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)p.onClose()}}>
    <aside className="drawer settings-drawer">
      <header><div><span className="eyebrow">NOVA</span><h2>Settings</h2></div><button onClick={p.onClose}><X/></button></header>
      <section><h3>ACCOUNT</h3><div className="account-card">{p.account.picture&&<img src={p.account.picture} referrerPolicy="no-referrer"/>}<div><b>{p.account.name}</b><small>{p.account.email}</small></div></div><button disabled={signingOut} onClick={async()=>{setSigningOut(true);try{await p.onSignOut()}finally{setSigningOut(false)}}}><LogOut/>{signingOut?'SIGNING OUT...':'SIGN OUT'}</button></section>
      <section><h3>PROFILE</h3><label>DISPLAY NAME<input value={draft} maxLength={28} onChange={(e)=>setDraft(e.target.value)}/></label><button className="save-setting" onClick={()=>p.onUsername(draft.trim()||p.username)}><Save/>SAVE NAME</button></section>
      <section><h3>PRIVACY & LEGAL</h3><button onClick={()=>setLegal('privacy')}><Shield/>PRIVACY POLICY</button><button onClick={()=>setLegal('terms')}>TERMS OF SERVICE</button></section>
      <section><h3>APPEARANCE</h3><label className="toggle-row"><span><b>Reduce motion</b><small>Turns off most transitions.</small></span><input type="checkbox" checked={p.reduceMotion} onChange={(e)=>p.onReduceMotion(e.target.checked)}/></label></section>
      <section><h3>PERFORMANCE</h3><div className="metric-grid"><div><span>NOVA CPU</span><b>{metrics?`${metrics.nova_cpu_percent.toFixed(1)}%`:'—'}</b></div><div><span>NOVA RAM</span><b>{metrics?`${metrics.nova_memory_mb.toFixed(0)} MB`:'—'}</b></div><div><span>SYSTEM CPU</span><b>{metrics?`${metrics.system_cpu_percent.toFixed(0)}%`:'—'}</b></div><div><span>HELPERS</span><b>{metrics?.helper_processes??'—'}</b></div></div><p className="perf-note">Detailed monitoring only runs while this settings panel is open.</p><button onClick={async()=>{const path=await invoke<string>('export_diagnostics');setDiag(path)}}><Gauge/>EXPORT DIAGNOSTICS</button>{diag&&<code className="diag-path">{diag}</code>}</section>
    </aside>
    {legal&&<LegalDialog kind={legal} onClose={()=>setLegal(null)}/>} 
  </div>;
}
