import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import CommandPalette from './CommandPalette';

// [Wave G item 80] The Ctrl-K palette: opens on the shortcut, filters
// commands, queries the catalog once the query is long enough, and
// routes on Enter.

const api = vi.hoisted(() => ({ getProblems: vi.fn() }));

vi.mock('@/services/ApiService', () => ({
  ProblemService: api,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: false,
    user: null as import('@/types').User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

function pressCtrlK() {
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
}

describe('CommandPalette', () => {
  it('stays hidden until Ctrl-K', () => {
    const { container } = render(<CommandPalette />);
    expect(container.querySelector('[data-testid="command-palette"]')).toBeNull();
  });

  it('opens on Ctrl-K and lists navigation commands', async () => {
    render(<CommandPalette />);
    pressCtrlK();
    const dialog = await screen.findByTestId('command-palette');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(screen.getAllByRole('option').length).toBeGreaterThan(5);
  });

  it('shows guest commands when logged out and account commands when logged in', async () => {
    mocks.auth.isAuthenticated = false;
    const { unmount } = render(<CommandPalette />);
    pressCtrlK();
    await screen.findByTestId('command-palette');
    expect(screen.getAllByText(/Login/i).length).toBeGreaterThan(0);
    unmount();
    cleanup();

    mocks.auth.isAuthenticated = true;
    mocks.auth.user = {
      id: 1,
      username: 'alice',
      email: 'a@x.com',
      role: 'BASIC',
    };
    render(<CommandPalette />);
    pressCtrlK();
    await screen.findByTestId('command-palette');
    expect(screen.getAllByText(/Profile/i).length).toBeGreaterThan(0);
    mocks.auth.isAuthenticated = false;
    mocks.auth.user = null;
  });

  it('filters commands by query', async () => {
    render(<CommandPalette />);
    pressCtrlK();
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'contest' } });
    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBe(1);
    });
  });

  it('searches the catalog once the query reaches two chars', async () => {
    api.getProblems.mockResolvedValue({
      results: [{ id: 42, title_i18n: { en: 'A+B Problem' } }],
    });
    render(<CommandPalette />);
    pressCtrlK();
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'sum' } });
    await waitFor(() => expect(api.getProblems).toHaveBeenCalled());
    expect(api.getProblems).toHaveBeenCalledWith({ search: 'sum' }, { pageSize: 5 });
    await screen.findByText('A+B Problem');
  });

  it('closes on Escape', async () => {
    render(<CommandPalette />);
    pressCtrlK();
    await screen.findByTestId('command-palette');
    fireEvent.keyDown(await screen.findByRole('textbox'), { key: 'Escape' });
    expect(screen.queryByTestId('command-palette')).toBeNull();
  });
});
