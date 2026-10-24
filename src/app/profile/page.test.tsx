import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import UserProfilePageRoute from './page';
import { AuthService, SubmissionService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import type { User } from '@/types';

// The profile page now fires three parallel fetches (me + statistics +
// recents); under full-suite jsdom load the heavier tests need more than
// the 5s default.
vi.setConfig({ testTimeout: 15000 });

const statsMock = vi.mocked(AuthService.getMyStatistics);
const subsMock = vi.mocked(SubmissionService.getSubmissions);

// next/navigation hooks only exist inside a live Next.js app context;
// ProtectedRoute uses useRouter, so it is mocked (same pattern as the
// scaffold's layout.test.tsx).
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
}));

vi.mock('@/services/ApiService', () => ({
  AuthService: {
    getMe: vi.fn(),
    changePassword: vi.fn(),
    getMyStatistics: vi.fn(),
    exportAccount: vi.fn(),
    deleteAccount: vi.fn(),
  },
  SubmissionService: { getSubmissions: vi.fn() },
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }));

// vitest runs with globals: false, so @testing-library/react cannot register
// its auto-cleanup — without this, rendered bodies accumulate across tests.
afterEach(cleanup);

const adminUser: User = { id: 1, username: 'admin', email: 'admin@example.com', role: 'ADMIN' };
const basicUser: User = { id: 2, username: 'alice', email: 'alice@example.com', role: 'BASIC_USER' };

type AuthShape = ReturnType<typeof useAuth>;

const authed = (overrides: Partial<AuthShape> = {}): AuthShape => ({
  isAuthenticated: true,
  user: adminUser,
  login: vi.fn(),
  logout: vi.fn(),
  ...overrides,
});

// The MUI TextField labels are not resolvable via getByLabelText in this MUI
// version, so the password inputs are addressed by their explicit ids.
const fillPasswordForm = (current: string, next: string, confirm: string) => {
  fireEvent.change(document.getElementById('current-password') as HTMLElement, { target: { value: current } });
  fireEvent.change(document.getElementById('new-password') as HTMLElement, { target: { value: next } });
  fireEvent.change(document.getElementById('confirm-new-password') as HTMLElement, { target: { value: confirm } });
};

// The redesigned profile splits content across an 'overview' / 'settings' tab bar
// (page.tsx:221,282). Account info, connected accounts and the password form all
// live under 'settings', which is NOT the mounted default -- so tests must switch.
const openSettings = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'settings' }));
};

const submitPasswordForm = () => {
  fireEvent.submit(document.querySelector('form')!);
};

describe('UserProfilePage (/profile)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_API_BASE;
    vi.mocked(useAuth).mockReturnValue(authed());
    vi.mocked(AuthService.getMe).mockResolvedValue(adminUser);
    vi.mocked(AuthService.changePassword).mockResolvedValue({});
    statsMock.mockResolvedValue({
      solved: 5, attempted: 8, total_submissions: 20, acceptance_rate: 0.625,
      per_difficulty: { EASY: { solved: 4, attempted: 6 }, MEDIUM: { solved: 1, attempted: 2 }, HARD: { solved: 0, attempted: 0 } },
      per_language: { python3: 15 },
      active_dates_90d: [], current_streak: 2, max_streak: 5, total_active_days: 6,
      ladder: { points: 7, level: 1, next_level_points: 10, progress: 0.7 },
      badges: ['first_ac', 'streak_7'],
    });
    subsMock.mockResolvedValue({
      next: null, previous: null,
      results: [
        { id: 31, problem: { id: 1, title_i18n: { en: 'Two Sum' } }, language: 'python3', verdict: 'AC', submission_time: '2026-10-01T10:00:00Z' },
      ],
    } as never);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_API_BASE;
  });

  it('renders nothing and redirects to /login when there is no user (route guard)', () => {
    vi.mocked(useAuth).mockReturnValue(authed({ user: null, isAuthenticated: false }));
    const { container } = render(<UserProfilePageRoute />);
    expect(container).toBeEmptyDOMElement();
    expect(replaceMock).toHaveBeenCalledWith('/login');
  });

  it('renders the profile for any authenticated role (BASIC_USER is allowed)', async () => {
    vi.mocked(useAuth).mockReturnValue(authed({ user: basicUser }));
    vi.mocked(AuthService.getMe).mockResolvedValue(basicUser);
    render(<UserProfilePageRoute />);
    await openSettings();
    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.getByText('Username')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('BASIC USER')).toBeInTheDocument();
  });

  it('shows the spinner while the profile is loading', () => {
    vi.mocked(AuthService.getMe).mockReturnValue(new Promise(() => {}));
    render(<UserProfilePageRoute />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('replaces the page with an error alert when getMe fails', async () => {
    vi.mocked(AuthService.getMe).mockRejectedValue(new Error('token expired'));
    render(<UserProfilePageRoute />);
    expect(await screen.findByText('Failed to load user profile.')).toBeInTheDocument();
    expect(screen.queryByText('admin')).not.toBeInTheDocument();
  });

  it('builds connect-account hrefs from NEXT_PUBLIC_API_BASE when set', async () => {
    process.env.NEXT_PUBLIC_API_BASE = 'http://api.example.com';
    // API_BASE_URL is a module-level const in api-config.ts, frozen at import.
    // The module graph must be reset and the page re-imported for a new base.
    vi.resetModules();
    const { default: FreshProfileRoute } = await import('./page');
    render(<FreshProfileRoute />);
    await openSettings();
    expect(await screen.findByText('admin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect Google' })).toHaveAttribute(
      'href',
      'http://api.example.com/api/v1/auth/google/login/?process=connect'
    );
    expect(screen.getByRole('link', { name: 'Connect GitHub' })).toHaveAttribute(
      'href',
      'http://api.example.com/api/v1/auth/github/login/?process=connect'
    );
  });

  it('defaults connect-account hrefs to localhost when no env var is set', async () => {
    render(<UserProfilePageRoute />);
    await openSettings();
    expect(await screen.findByText('admin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect Google' })).toHaveAttribute(
      'href',
      'http://localhost:8000/api/v1/auth/google/login/?process=connect'
    );
    expect(screen.getByRole('link', { name: 'Connect GitHub' })).toHaveAttribute(
      'href',
      'http://localhost:8000/api/v1/auth/github/login/?process=connect'
    );
  });

  it('blocks submission and alerts when the new passwords do not match', async () => {
    render(<UserProfilePageRoute />);
    await openSettings();
    await screen.findByText('admin');
    fillPasswordForm('old', 'newpass1', 'different');
    submitPasswordForm();
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(AuthService.changePassword).not.toHaveBeenCalled();
  });

  it('blocks submission when signed out', async () => {
    vi.mocked(useAuth).mockReturnValue(authed({ isAuthenticated: false }));
    render(<UserProfilePageRoute />);
    await openSettings();
    await screen.findByText('admin');
    fillPasswordForm('old', 'newpass1', 'newpass1');
    submitPasswordForm();
    expect(await screen.findByText('You must be logged in to change your password.')).toBeInTheDocument();
    expect(AuthService.changePassword).not.toHaveBeenCalled();
  });

  it('changes the password, shows a success message, and clears the fields', async () => {
    render(<UserProfilePageRoute />);
    await openSettings();
    await screen.findByText('admin');
    fillPasswordForm('oldpass', 'newpass1', 'newpass1');
    submitPasswordForm();
    expect(await screen.findByText('Password changed successfully.')).toBeInTheDocument();
    await waitFor(() => {
      expect((document.querySelector('#current-password') as HTMLInputElement).value).toBe('');
      expect((document.querySelector('#new-password') as HTMLInputElement).value).toBe('');
      expect((document.querySelector('#confirm-new-password') as HTMLInputElement).value).toBe('');
    });
    expect(AuthService.changePassword).toHaveBeenCalledWith({
      old_password: 'oldpass',
      new_password1: 'newpass1',
      new_password2: 'newpass1',
    });
  });

  it('surfaces the API error message when the change fails', async () => {
    vi.mocked(AuthService.changePassword).mockRejectedValue(new Error('Old password is incorrect.'));
    render(<UserProfilePageRoute />);
    await openSettings();
    await screen.findByText('admin');
    fillPasswordForm('wrong', 'newpass1', 'newpass1');
    submitPasswordForm();
    expect(await screen.findByText('Old password is incorrect.')).toBeInTheDocument();
  });

  it('falls back to a generic message when the error message is empty', async () => {
    vi.mocked(AuthService.changePassword).mockRejectedValue(new Error(''));
    render(<UserProfilePageRoute />);
    await openSettings();
    await screen.findByText('admin');
    fillPasswordForm('old', 'newpass1', 'newpass1');
    submitPasswordForm();
    expect(await screen.findByText('Password change failed.')).toBeInTheDocument();
  });

  it('falls back to a generic message for a non-Error rejection', async () => {
    vi.mocked(AuthService.changePassword).mockRejectedValue('service unavailable');
    render(<UserProfilePageRoute />);
    await openSettings();
    await screen.findByText('admin');
    fillPasswordForm('old', 'newpass1', 'newpass1');
    submitPasswordForm();
    expect(await screen.findByText('Password change failed.')).toBeInTheDocument();
  });

  it('disables the submit button and shows a spinner while submitting', async () => {
    let resolveChange: (value: { detail?: string }) => void = () => {};
    vi.mocked(AuthService.changePassword).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveChange = resolve;
        }) as ReturnType<typeof AuthService.changePassword>
    );
    render(<UserProfilePageRoute />);
    await openSettings();
    await screen.findByText('admin');
    fillPasswordForm('old', 'newpass1', 'newpass1');
    submitPasswordForm();
    expect(document.querySelector('form button[type="submit"]')).toBeDisabled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    await act(async () => {
      resolveChange({});
    });
    await waitFor(() =>
      expect(document.querySelector('form button[type="submit"]')).toBeEnabled()
    );
    expect(await screen.findByText('Password changed successfully.')).toBeInTheDocument();
  });
});


describe('ProfileOverview live statistics [B5/RAT-4/5/6]', () => {
  beforeEach(() => {
    statsMock.mockResolvedValue({
      solved: 5, attempted: 8, total_submissions: 20, acceptance_rate: 0.625,
      per_difficulty: { EASY: { solved: 4, attempted: 6 }, MEDIUM: { solved: 1, attempted: 2 }, HARD: { solved: 0, attempted: 0 } },
      per_language: { python3: 15 },
      active_dates_90d: [], current_streak: 2, max_streak: 5, total_active_days: 6,
      ladder: { points: 7, level: 1, next_level_points: 10, progress: 0.7 },
      badges: ['first_ac', 'streak_7'],
    });
    subsMock.mockResolvedValue({
      next: null, previous: null,
      results: [
        { id: 31, problem: { id: 1, title_i18n: { en: 'Two Sum' } }, language: 'python3', verdict: 'AC', submission_time: '2026-10-01T10:00:00Z' },
      ],
    } as never);
  });

  it('renders ladder, badges, streak pairing and real recents from the API', async () => {
    vi.mocked(useAuth).mockReturnValue(authed());
    vi.mocked(AuthService.getMe).mockResolvedValue(basicUser);
    render(<UserProfilePageRoute />);
    await waitFor(() => {
      expect(screen.getByText('Lv 1')).toBeInTheDocument();
    });
    expect(screen.getByText('7')).toBeInTheDocument(); // ladder points
    expect(screen.getByText(/best 5/)).toBeInTheDocument(); // max-streak pairing
    expect(screen.getByText('First AC')).toBeInTheDocument();
    expect(screen.getByText('7-day streak')).toBeInTheDocument();
    expect(screen.getByText(/Two Sum/)).toBeInTheDocument(); // real recent row
    // Fabricated constants are gone.
    expect(screen.queryByText('#24')).not.toBeInTheDocument();
    expect(screen.queryByText('3,480')).not.toBeInTheDocument();
  });

  it('degrades honestly when statistics fail to load', async () => {
    vi.mocked(useAuth).mockReturnValue(authed());
    vi.mocked(AuthService.getMe).mockResolvedValue(basicUser);
    statsMock.mockRejectedValue(new Error('down'));
    render(<UserProfilePageRoute />);
    await waitFor(() => {
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
    });
  });

  it('offers GDPR export from the settings tab [LEG-1]', async () => {
    vi.mocked(useAuth).mockReturnValue(authed());
    vi.mocked(AuthService.getMe).mockResolvedValue(basicUser);
    render(<UserProfilePageRoute />);
    // Overview is the default tab — wait for it, then switch.
    await waitFor(() => {
      expect(screen.getByText('Lv 1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'settings' }));
    expect(screen.getByText('Account Info')).toBeInTheDocument();
    expect(screen.getByText('Your data (GDPR)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export my data/i })).toBeInTheDocument();
  });
});
