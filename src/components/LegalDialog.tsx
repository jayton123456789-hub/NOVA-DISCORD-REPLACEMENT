import { X } from 'lucide-react';

type Kind = 'terms' | 'privacy';
export default function LegalDialog({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  return <div className="modal-layer" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <section className="modal legal-dialog" role="dialog" aria-modal="true" aria-label={kind === 'terms' ? 'NOVA Terms of Service' : 'NOVA Privacy Policy'}>
      <header><div><span className="eyebrow">NOVA</span><h2>{kind === 'terms' ? 'Terms of Service' : 'Privacy Policy'}</h2></div><button onClick={onClose} aria-label="Close legal notice"><X/></button></header>
      {kind === 'terms' ? <div className="legal-copy">
        <p>NOVA is a private social application for communicating and sharing with people you choose. You are responsible for the content you send and for following applicable law.</p>
        <p>Your NOVA account may use Google for authentication and Cloudflare-operated NOVA infrastructure for account bootstrap, Space admission, rendezvous, and encrypted control transport. Those services remain subject to their own terms.</p>
        <p>NOVA is provided on a best-effort basis while the private beta is under active development. Network availability is not guaranteed, and peer-to-peer features can expose participants' network addresses to one another.</p>
        <p>Do not use NOVA to distribute unlawful content, attack other systems, impersonate another person, or bypass another person's access controls.</p>
      </div> : <div className="legal-copy">
        <p>NOVA stores the minimum account information needed to operate the service: your Google account identifier, email address, display name, optional avatar, registered device public keys, Space membership, and service-session metadata.</p>
        <p>Private device keys and NOVA session credentials are stored on your Windows account using OS-protected storage. Ordinary Space chat history remains on participating NOVA computers in the current architecture. Relay control payloads are encrypted by NOVA before transport.</p>
        <p>Google processes the sign-in flow. Cloudflare hosts NOVA's limited account, rendezvous, admission, and encrypted-control infrastructure. NOVA does not need your Google password and does not sell account data to advertisers.</p>
        <p>Future distributed-storage features may change where encrypted replicas are held. NOVA should disclose those changes before enabling them.</p>
      </div>}
      <button className="modal-primary" onClick={onClose}>CLOSE</button>
    </section>
  </div>;
}
