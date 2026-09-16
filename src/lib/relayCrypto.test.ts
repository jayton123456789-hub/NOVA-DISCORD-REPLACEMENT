import { expect, test } from 'vitest';
import { encryptedChannel } from './relayCrypto';
import { inviteString, parseInvite } from './connection';

test('encrypted control traffic authenticates context, rejects replay, and reassembles large history', async () => {
  const key = '12'.repeat(32);
  const sender = await encryptedChannel(key, 'space|connection|host');
  const receiver = await encryptedChannel(key, 'space|connection|host');
  const text = JSON.stringify({ history: 'hello friends 🎮'.repeat(10000) });
  const frames = await sender.seal(text);
  expect(frames.length).toBeGreaterThan(1);
  let result: string | null = null;
  for (const frame of frames) result = await receiver.open(frame);
  expect(result).toBe(text);
  await expect(receiver.open(frames[0])).rejects.toThrow();
  const wrong = await encryptedChannel(key, 'space|different-connection|host');
  await expect(wrong.open(frames[0])).rejects.toThrow();
  const wrongKey = await encryptedChannel('34'.repeat(32), 'space|connection|host');
  await expect(wrongKey.open(frames[0])).rejects.toThrow();
});

test('internet invites retain a stable Space identity and require secure endpoints', () => {
  const config = { host: 'relay.example.org', port: 443, spaceId: crypto.randomUUID(), relayUrl: 'https://relay.example.org', token: 'ab'.repeat(32) };
  expect(parseInvite(inviteString(config))).toEqual(config);
  expect(() => parseInvite(inviteString({ ...config, relayUrl: 'http://relay.example.org' }))).toThrow();
});
