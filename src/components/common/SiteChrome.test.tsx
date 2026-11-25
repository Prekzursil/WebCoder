import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import {
  ThemeModeProvider,
  applyThemeMode,
  readStoredTheme,
  useThemeMode,
} from '@/context/ThemeModeContext';
import ThemeToggle from './ThemeToggle';
import ShortcutHelp, { GLOBAL_SHORTCUTS } from './ShortcutHelp';

// [Wave G items 79 + 81] The theme context/toggle pair and the keyboard
// map overlay.

function Probe() {
  const { mode } = useThemeMode();
  return <span data-testid="mode-probe">{mode}</span>;
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(cleanup);

describe('ThemeModeContext + ThemeToggle [item 79]', () => {
  it('defaults to dark and flips to light on toggle', async () => {
    render(
      <ThemeModeProvider>
        <Probe />
        <ThemeToggle />
      </ThemeModeProvider>,
    );
    expect(screen.getByTestId('mode-probe').textContent).toBe('dark');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    await waitFor(() => expect(screen.getByTestId('mode-probe').textContent).toBe('light'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem('wc-theme-mode')).toBe('light');
  });

  it('re-applies the stored choice on mount', async () => {
    window.localStorage.setItem('wc-theme-mode', 'light');
    render(
      <ThemeModeProvider>
        <Probe />
      </ThemeModeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('mode-probe').textContent).toBe('light'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('helpers tolerate a closed localStorage', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readStoredTheme()).toBe('dark');
    spy.mockRestore();
    // applyThemeMode is a no-op server-side / always safe client-side.
    expect(() => applyThemeMode('dark')).not.toThrow();
  });
});

describe('ShortcutHelp [item 81]', () => {
  it('stays hidden until "?"', () => {
    render(<ShortcutHelp />);
    expect(screen.queryByTestId('shortcut-help')).toBeNull();
  });

  it('opens on ? and lists every global shortcut', async () => {
    render(<ShortcutHelp />);
    fireEvent.keyDown(window, { key: '?' });
    const dialog = await screen.findByTestId('shortcut-help');
    expect(dialog).toHaveAttribute('role', 'dialog');
    for (const row of GLOBAL_SHORTCUTS) {
      expect(screen.getAllByText(row.keys).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/command palette/i)).toBeInTheDocument();
  });

  it('ignores ? while typing in an input', () => {
    render(
      <>
        <ShortcutHelp />
        <input aria-label="probe input" />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText('probe input'), { key: '?' });
    expect(screen.queryByTestId('shortcut-help')).toBeNull();
  });

  it('closes on the Close button', async () => {
    render(<ShortcutHelp />);
    fireEvent.keyDown(window, { key: '?' });
    await screen.findByTestId('shortcut-help');
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByTestId('shortcut-help')).toBeNull();
  });
});
