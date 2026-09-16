import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

async function writeClipboard(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const input = document.createElement('textarea');
  input.value = value; input.setAttribute('readonly', ''); input.style.position = 'fixed'; input.style.opacity = '0';
  document.body.appendChild(input); input.select();
  const copied = document.execCommand?.('copy'); input.remove();
  if (!copied) throw new Error('Clipboard unavailable');
}

export default function InviteDialog({ invite, onClose, internetStatus, internetReady }: { internetStatus?: string; internetReady?: boolean; invite: string; onClose: () => void }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector('button')?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const controls = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [onClose]);
  async function copy() {
    setBusy(true); setStatus('');
    try { await writeClipboard(invite); setStatus('Copied! Paste it into your conversation.'); }
    catch { setStatus('Copy failed. Select the invite below and press Ctrl+C.'); }
    finally { setBusy(false); }
  }
  return <div className="modal-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal invite-dialog" ref={panel} role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <header><h2 id="invite-title">Invite your friends</h2><button onClick={onClose} aria-label="Close invite"><X/></button></header>
      <p role="status">{internetStatus}</p><p>This invite connects to the host PC. The host must keep NOVA open.</p>
      <input aria-label="Space invite" readOnly value={invite} onFocus={(e) => e.currentTarget.select()}/>
      <button className="modal-primary" disabled={!invite || busy} onClick={copy}>{busy ? 'COPYING…' : status.startsWith('Copied') ? 'COPIED!' : 'COPY INVITE'}</button>
      <p role="status">{status}</p>
      <p>{internetReady ? 'This internet invite works across different homes while the host and NOVA online service are reachable. Voice uses direct WebRTC or an available project TURN relay.' : 'This is a local network invite. Do not send it to friends in other homes until the internet service shows ready.'}</p>
    </div>
  </div>;
}
