import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import CopyButton from './CopyButton';

// CopyButton [A7/A18/F20]: clipboard write with execCommand fallback, the
// "Copied!" confirmation, and lazy text resolution for share links.

afterEach(cleanup);

describe('CopyButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('copies static text and shows the copied confirmation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CopyButton text="sample input" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('sample input');
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  it('copies the current page URL when shareLink is set', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CopyButton shareLink label="Copy link" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    // jsdom's location cannot be reassigned to an arbitrary URL; assert the
    // resolved value is the live page URL (whatever jsdom's default is).
    expect(writeText).toHaveBeenCalledWith(window.location.href);
  });

  it('falls back to execCommand when the async clipboard is unavailable', async () => {
    const original = navigator.clipboard;
    // @ts-expect-error simulate an older browser
    delete navigator.clipboard;
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    try {
      render(<CopyButton text="legacy" />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
      expect(execCommand).toHaveBeenCalledWith('copy');
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument()
      );
    } finally {
      Object.assign(navigator, { clipboard: original });
    }
  });
});
