import { expect, test } from 'vitest';
import { validateServiceEndpoint, trustedRelay } from './service';

test('NOVA service endpoints require HTTPS except for explicit loopback development', () => {
  expect(validateServiceEndpoint('https://nova.example.com')).toBe('https://nova.example.com');
  expect(validateServiceEndpoint('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787');
  expect(validateServiceEndpoint('http://localhost:8787')).toBe('http://localhost:8787');
  expect(() => validateServiceEndpoint('http://nova.example.com')).toThrow();
  expect(() => validateServiceEndpoint('https://user:pass@nova.example.com')).toThrow();
  expect(() => validateServiceEndpoint('https://nova.example.com/path')).toThrow();
});

test('an invite cannot send an account session to another HTTPS server', () => {
  expect(trustedRelay('https://nova.example.com/', 'https://nova.example.com')).toBe('https://nova.example.com');
  expect(() => trustedRelay('https://nova.example.com.attacker.test', 'https://nova.example.com')).toThrow();
  expect(() => trustedRelay('https://attacker.test', 'https://nova.example.com')).toThrow();
  expect(() => trustedRelay('https://nova.example.com:8443', 'https://nova.example.com')).toThrow();
});
