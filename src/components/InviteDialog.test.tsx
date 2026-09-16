// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import InviteDialog from './InviteDialog';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('copy confirms the clipboard operation and exposes failures', async () => {
  const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('locked'));
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<InviteDialog invite="nova://test:123/token" onClose={vi.fn()}/>);
  fireEvent.click(screen.getByText('COPY INVITE'));
  await screen.findByText('COPIED!');
  expect(writeText).toHaveBeenCalledWith('nova://test:123/token');
  fireEvent.click(screen.getByText('COPIED!'));
  await screen.findByText('Copy failed. Select the invite below and press Ctrl+C.');
});

test('close button, Escape, and outside click dismiss; inside clicks do not', () => {
  const close = vi.fn();
  render(<InviteDialog invite="nova://test:123/token" onClose={close}/>);
  const dialog = screen.getByRole('dialog');
  fireEvent.mouseDown(dialog);
  expect(close).not.toHaveBeenCalled();
  fireEvent.mouseDown(dialog.parentElement!);
  fireEvent.keyDown(document, { key: 'Escape' });
  fireEvent.click(screen.getByLabelText('Close invite'));
  expect(close).toHaveBeenCalledTimes(3);
});
