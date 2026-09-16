import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const endpoint = process.env.NOVA_TEST_RELAY || 'http://127.0.0.1:8787';


test('health endpoint reports deployment capabilities without exposing secrets', async () => {
  const response = await fetch(`${endpoint}/health`);
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.service, 'NOVA online services');
  assert.ok(health.version >= 3);
  assert.equal(typeof health.googleConfigured, 'boolean');
  assert.equal(typeof health.turnConfigured, 'boolean');
});

test('development account sessions authorize profile/device APIs and logout revokes the session', async () => {
  const login = await fetch(`${endpoint}/v1/auth/dev`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:'Account Test',email:`account-${randomUUID()}@nova.invalid`}) });
  assert.equal(login.status, 200);
  const account = await login.json();
  assert.match(account.session, /^[a-f0-9]{64}$/);
  const headers = { Authorization: `Bearer ${account.session}` };
  const me = await fetch(`${endpoint}/v1/account/me`, { headers });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).email, account.user.email);

  const deviceId = randomUUID();
  const signing = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const encryption = await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const signingPublicKey = await crypto.subtle.exportKey('jwk', signing.publicKey);
  const encryptionPublicKey = await crypto.subtle.exportKey('jwk', encryption.publicKey);
  for (const invalid of [null, {kty:'EC',crv:'P-256',x:'x',y:'y'}, await crypto.subtle.exportKey('jwk', signing.privateKey)]) {
    const response = await fetch(`${endpoint}/v1/devices/register`, {method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({deviceId, signingPublicKey:invalid,encryptionPublicKey})});
    assert.equal(response.status,400);
  }
  const device = await fetch(`${endpoint}/v1/devices/register`, { method:'POST', headers:{...headers,'Content-Type':'application/json'}, body:JSON.stringify({deviceId,deviceName:'Test PC',signingPublicKey,encryptionPublicKey}) });
  assert.equal(device.status, 200);

  const logout = await fetch(`${endpoint}/v1/auth/logout`, { method:'POST', headers });
  assert.equal(logout.status, 204);
  assert.equal((await fetch(`${endpoint}/v1/account/me`, { headers })).status, 401);
});
