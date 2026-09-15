import { useEffect, useRef, useState } from 'react';

/** Audio has its own lifetime; hiding a camera must never silence a participant. */
export default function RemoteAudio({ stream, muted, name }: {
  stream: MediaStream | null; muted: boolean; name: string;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let active = true;
    element.srcObject = stream;
    setBlocked(false);
    if (stream) element.play().catch(() => { if (active) setBlocked(true); });
    return () => { active = false; element.pause(); element.srcObject = null; };
  }, [stream]);
  return <>
    <audio ref={ref} autoPlay muted={muted} />
    {blocked && <button onClick={() => {
      ref.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    }}>Enable audio for {name}</button>}
  </>;
}
