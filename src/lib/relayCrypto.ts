const utf8 = new TextEncoder();
const decode = new TextDecoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
const b64 = (bytes: Uint8Array) => btoa(Array.from(bytes, n => String.fromCharCode(n)).join(''));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export async function joinHash(token: string) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(token)))); }

// Standard AES-GCM, fresh nonces, connection/direction binding and ordered counters.
// Invite holders share a capability key; this is not the planned per-device identity system.
export async function encryptedChannel(token: string, context: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid encrypted invite');
  const bytes = Uint8Array.from(token.match(/../g)!, s => parseInt(s, 16));
  const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  let sent = 0, received = 0;
  let parts: string[] = [];
  let expectedParts = 0;
  return {
    async seal(text: string): Promise<string[]> {
      const encoded = b64(utf8.encode(text));
      if (encoded.length > 2800000) throw new Error('Control message exceeds the limit');
      const total = Math.max(1, Math.ceil(encoded.length / 24000));
      const frames: string[] = [];
      for (let part = 0; part < total; part++) {
        const nonce = crypto.getRandomValues(new Uint8Array(12));
        const clear = JSON.stringify({ seq: ++sent, part, total, data: encoded.slice(part * 24000, (part + 1) * 24000) });
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: utf8.encode(context) }, key, utf8.encode(clear));
        frames.push(JSON.stringify({ nonce: b64(nonce), cipher: b64(new Uint8Array(cipher)) }));
      }
      return frames;
    },
    async open(frame: string): Promise<string | null> {
      if (frame.length > 90000) throw new Error('Encrypted frame too large');
      const packet = JSON.parse(frame);
      const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(packet.nonce), additionalData: utf8.encode(context) }, key, unb64(packet.cipher));
      const value = JSON.parse(decode.decode(clear));
      if (value.seq !== received + 1 || !Number.isInteger(value.total) || value.total < 1 || value.total > 117 || value.part !== parts.length || typeof value.data !== 'string' || value.data.length > 24000) throw new Error('Invalid or replayed control frame');
      if (!parts.length) expectedParts = value.total;
      if (expectedParts !== value.total) throw new Error('Fragment sequence changed');
      received++;
      parts.push(value.data);
      if (parts.length !== expectedParts) return null;
      const text = decode.decode(unb64(parts.join('')));
      parts = []; expectedParts = 0;
      return text;
    }
  };
}
