async (page) => {
  const result = await page.evaluate(async () => {
    const { startInternetHost, RelaySocket } = await import('/src/lib/relay.ts');
    const id = crypto.randomUUID(), token = '11'.repeat(32), owner = '22'.repeat(32);
    const devSession = async (name) => { const r = await fetch('http://127.0.0.1:8787/v1/auth/dev',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email:`${name.toLowerCase()}@nova.invalid`})}); if(!r.ok) throw new Error('Dev account failed'); return (await r.json()).session; };
    const hostSession = await devSession('Host');
    let stop;
    const clients = [];
    try {
      await new Promise((resolve, reject) => {
        const deadline = setTimeout(() => reject(new Error('Host registration timed out')), 10000);
        stop = startInternetHost({ space_id: id, token, relay_owner: owner, port: 38766 }, hostSession, (message, ready) => {
          if (ready) { clearTimeout(deadline); resolve(); }
        });
      });
      const config = { host: '127.0.0.1', port: 8787, relayUrl: 'http://127.0.0.1:8787', spaceId: id, token };
      async function guest(name) {
        const socket = new RelaySocket(config, name, await devSession(name)); clients.push(socket);
        const frames = [], waiting = [];
        socket.onmessage = e => { const message = JSON.parse(e.data); frames.push(message); waiting.forEach(check => check()); };
        function until(predicate) { return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}`)), 8000);
          const check = () => { const found = frames.find(predicate); if (found) { clearTimeout(timer); const index=waiting.indexOf(check);if(index>=0)waiting.splice(index,1); resolve(found); } };
          waiting.push(check); check();
        }); }
        return { socket, until };
      }
      const [alice,bob] = await Promise.all([guest('Alice'),guest('Bob')]);
      const a = await alice.until(m => m.type === 'welcome');
      const b = await bob.until(m => m.type === 'welcome');
      if (a.channels.length || b.channels.length) throw new Error('Fixture unexpectedly has seeded channels');
      alice.socket.send(JSON.stringify({type:'create_channel',name:'our-channel',kind:'text',request_id:'channel-test'}));
      await alice.until(m => m.type==='ack' && m.request_id==='channel-test');
      const changed = await bob.until(m => m.type==='channels');
      bob.socket.send(JSON.stringify({type:'message',channel_id:changed.channels[0].id,body:'Hello across encrypted relay',request_id:'message-test'}));
      await bob.until(m => m.type==='ack' && m.request_id==='message-test');
      const message = await alice.until(m => m.type==='message');
      if (message.message.body!=='Hello across encrypted relay') throw new Error('Message mismatch');
      const carol = await guest('Carol');
      const history = await carol.until(m=>m.type==='welcome');
      if (!history.messages.some(m=>m.id===message.message.id)) throw new Error('Saved message missing from history');
      return { encryptedGuests: 3, seededChannels: 0, customChannel: true, persistedMessage: true };
    } finally { clients.forEach(c=>c.close()); stop?.(); }
  });
  await page.evaluate(value => { window.__novaTransport = value; }, result);
}
