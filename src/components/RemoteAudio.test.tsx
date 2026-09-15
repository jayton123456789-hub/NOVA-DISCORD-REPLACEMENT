// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RemoteAudio from './RemoteAudio';

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('plays an audio-only stream and releases it without stopping remote tracks', () => {
  const stop = vi.fn();
  const stream = { getVideoTracks: () => [], getAudioTracks: () => [{ stop }] } as unknown as MediaStream;
  const view = render(<RemoteAudio stream={stream} muted={false} name="Friend" />);
  const audio = view.container.querySelector('audio')!;
  expect(audio.srcObject).toBe(stream);
  expect(audio.play).toHaveBeenCalled();
  view.rerender(<RemoteAudio stream={stream} muted name="Friend" />);
  expect(audio.muted).toBe(true);
  view.unmount();
  expect(audio.srcObject).toBe(null);
  expect(stop).not.toHaveBeenCalled();
});

test('lets the user recover from autoplay rejection', async () => {
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('NotAllowedError'));
  render(<RemoteAudio stream={{} as MediaStream} muted={false} name="Friend" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Enable audio for Friend' }));
  await waitFor(() => expect(screen.queryByRole('button')).toBe(null));
});
