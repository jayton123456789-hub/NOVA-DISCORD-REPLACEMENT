import { Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export default function TitleBar() {
  const win = '__TAURI_INTERNALS__' in window ? getCurrentWindow() : null;
  return <header className="titlebar">
    <div className="drag" data-tauri-drag-region><img src="/nova-logo.webp" alt=""/><b data-tauri-drag-region>NOVA</b><span data-tauri-drag-region>SOCIAL</span></div>
    <div className="window-controls">
      <button onClick={() => win?.minimize()} aria-label="Minimize"><Minus size={14}/></button>
      <button onClick={() => win?.toggleMaximize()} aria-label="Maximize"><Square size={11}/></button>
      <button className="close" onClick={() => win?.close()} aria-label="Close"><X size={14}/></button>
    </div>
  </header>;
}
