// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import VoiceStage from './VoiceStage';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
test('camera changes never remove remote audio or create duplicate audio playback', () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  let tracks: { readyState: string }[] = [];
  const stream = { getVideoTracks: () => tracks } as unknown as MediaStream;
  const noop = () => {};
  const props = {
    channelName: 'Lounge', selfId: 'me',
    members: [{ peer_id: 'friend', name: 'Friend', status: 'online' as const, voice_channel: 'lounge' }],
    remoteStreams: { friend: stream }, localPreview: null, muted: false, deafened: false,
    cameraOn: false, sharing: false, mediaNote: '', onMute: noop, onDeafen: noop,
    onCamera: noop, onShare: noop, onLeave: noop, onOverlay: noop,
  };
  const view = render(<VoiceStage {...props} />);
  const audio = view.container.querySelector('audio');
  expect(audio?.srcObject).toBe(stream);
  expect(view.container.querySelector('video')).toBe(null);
  tracks = [{ readyState: 'live' }];
  view.rerender(<VoiceStage {...props} />);
  expect(view.container.querySelector('audio')).toBe(audio);
  expect(view.container.querySelector('video')?.muted).toBe(true);
  expect(view.container.querySelector('video')?.srcObject).toBe(stream);
  tracks = [];
  view.rerender(<VoiceStage {...props} deafened />);
  expect(view.container.querySelector('audio')).toBe(audio);
  expect(audio?.muted).toBe(true);
});
