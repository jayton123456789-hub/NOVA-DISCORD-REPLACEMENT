import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';

const endpoint = process.env.NOVA_TEST_RELAY || 'http://127.0.0.1:8787';
function client(url) {
  const ws = new WebSocket(url);
  const messages = [], pending = [];
  ws.addEventListener('message', e => { const value = JSON.parse(e.data); const waiter = pending.shift(); waiter ? waiter(value) : messages.push(value); });
  const next = () => new Promise((resolve, reject) => {
    if (messages.length) return resolve(messages.shift());
    const timer = setTimeout(() => reject(new Error('Relay response timeout')), 4000);
    pending.push(value => { clearTimeout(timer); resolve(value); });
  });
  const opened = new Promise((resolve, reject) => { ws.addEventListener('open', resolve, {once:true});ws.addEventListener('error', reject, {once:true}); });
  return { ws, next, opened, send: data => ws.send(JSON.stringify(data)) };
}
async function devAccount(name) {
  const response = await fetch(`${endpoint}/v1/auth/dev`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,email:`${name.toLowerCase()}@nova.invalid`}) });
  assert.equal(response.status, 200);
  return await response.json();
}

test('account-backed relay persists membership, routes opaque envelopes, rejects takeover and closes guests when host leaves', async () => {
  const id = randomUUID(), owner = 'ab'.repeat(32), secret = 'cd'.repeat(32);
  const joinHash = createHash('sha256').update(secret).digest('hex');
  const url = `${endpoint}/v1/spaces/${id}`;
  const hostAccount = await devAccount('Host'), guestAccount = await devAccount('Guest'), badAccount = await devAccount('Bad');
  const register = (data, session) => fetch(`${url}/register`, {method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session}`},body:JSON.stringify(data)});
  assert.equal((await register({owner,joinHash},hostAccount.session)).status, 200);
  assert.equal((await register({owner:'ef'.repeat(32),joinHash},badAccount.session)).status, 403);
  const socketUrl = url.replace(/^http/, 'ws') + '/connect';
  const host = client(socketUrl), guest = client(socketUrl), bad = client(socketUrl);
  try {
    await Promise.all([host.opened,guest.opened,bad.opened]);
    host.send({role:'host',owner,session:hostAccount.session}); assert.equal((await host.next()).type,'ready');
    const badClosed = new Promise(resolve => bad.ws.addEventListener('close',resolve,{once:true}));
    bad.send({role:'guest',session:badAccount.session,joinHash:'00'.repeat(32)}); assert.equal((await badClosed).code,1008);
    guest.send({role:'guest',session:guestAccount.session,joinHash}); const ready = await guest.next();
    assert.equal(ready.type,'ready');assert.equal((await host.next()).id,ready.id);
    guest.send({type:'data',id:'forged-id',payload:'opaque-encrypted-packet'});
    const packet = await host.next(); assert.equal(packet.id,ready.id);
    host.send({type:'data',id:ready.id,payload:'encrypted-reply'});
    assert.equal((await guest.next()).payload,'encrypted-reply');
    guest.ws.close();
    await new Promise(resolve => setTimeout(resolve, 50));
    const returning = client(socketUrl); await returning.opened;
    returning.send({role:'guest',session:guestAccount.session,joinHash:'00'.repeat(32)});
    assert.equal((await returning.next()).type,'ready');
    returning.ws.close();
    const hostTakeover = client(socketUrl); await hostTakeover.opened;
    const takeoverClosed = new Promise(resolve => hostTakeover.ws.addEventListener('close',resolve,{once:true}));
    hostTakeover.send({role:'host',owner,session:badAccount.session}); assert.equal((await takeoverClosed).code,1008);
    hostTakeover.ws.close();
    const liveGuest = client(socketUrl); await liveGuest.opened; liveGuest.send({role:'guest',session:guestAccount.session,joinHash}); await liveGuest.next(); await host.next();
    const guestClosed = new Promise(resolve => liveGuest.ws.addEventListener('close',resolve,{once:true}));
    host.ws.close(); assert.equal((await guestClosed).code,1013);
    liveGuest.ws.close();
  } finally { host.ws.close();guest.ws.close();bad.ws.close(); }
});
