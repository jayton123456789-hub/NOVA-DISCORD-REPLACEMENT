import { useState } from 'react';
import LegalDialog from './LegalDialog';
import { serviceEndpoint } from '../lib/service';

export default function LoginScreen({ busy, error, onGoogle, onDevelopment }: { busy: boolean; error: string; onGoogle: () => void; onDevelopment?: () => void }) {
  const [legal, setLegal] = useState<'terms'|'privacy'|null>(null);
  const configured = !!serviceEndpoint;
  return <div className="connect-screen login-screen">
    <div className="connect-atmosphere"/>
    <section className="connect-brand">
      <img src="/nova-logo.webp"/>
      <span>NOVA SOCIAL</span>
      <h1>Your people.<br/>Your Space.</h1>
      <p>Sign in once, and NOVA remembers your account, devices, Spaces, and membership. Cloudflare is infrastructure behind NOVA; normal users never need a Cloudflare account.</p>
    </section>
    <section className="connect-panel login-panel">
      <span className="eyebrow">WELCOME TO NOVA</span>
      <h2>Sign in to continue</h2>
      <p className="login-copy">Google sign-in happens in your normal browser. NOVA never sees your Google password.</p>
      <button className="google-login" disabled={busy || !configured} onClick={onGoogle}><b>G</b><span>{busy ? 'SIGNING IN...' : 'CONTINUE WITH GOOGLE'}</span></button>
      {!configured && <div className="connect-error">This development build does not have a NOVA service endpoint configured yet.</div>}
      {error && <div className="connect-error" role="alert">{error}</div>}
      {onDevelopment && <button className="dev-login" disabled={busy} onClick={onDevelopment}>CONTINUE IN LOCAL DEVELOPMENT</button>}
      <p className="legal-links">By continuing, you agree to the <button onClick={()=>setLegal('terms')}>NOVA Terms of Service</button> and acknowledge the <button onClick={()=>setLegal('privacy')}>Privacy Policy</button>.</p>
    </section>
    {legal && <LegalDialog kind={legal} onClose={()=>setLegal(null)}/>} 
  </div>;
}
