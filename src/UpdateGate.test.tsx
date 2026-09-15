// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('./App', () => ({ default: () => null }));
beforeEach(() => { vi.resetModules(); invoke.mockReset(); });
test('startup installs an available update exactly once', async () => {
  invoke.mockResolvedValueOnce('1.0.3').mockResolvedValueOnce(undefined);
  const { runStartupUpdate } = await import('./UpdateGate');
  await Promise.all([runStartupUpdate(vi.fn()), runStartupUpdate(vi.fn())]);
  expect(invoke.mock.calls).toEqual([['check_update'], ['install_update']]);
});
test('no available update does not install', async () => {
  invoke.mockResolvedValue(null);
  const { runStartupUpdate } = await import('./UpdateGate');
  await runStartupUpdate(vi.fn());
  expect(invoke).toHaveBeenCalledTimes(1);
});
test('failed checks settle instead of hanging startup', async () => {
  invoke.mockRejectedValue(new Error('offline'));
  const { runStartupUpdate } = await import('./UpdateGate');
  await expect(runStartupUpdate(vi.fn())).rejects.toThrow('offline');
  expect(invoke).toHaveBeenCalledTimes(1);
});
