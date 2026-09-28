import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import UserProfilePageRoute from './page';
import { AuthService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import type { User } from '@/types';

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
  AuthService: { getMe: vi.fn(), changePassword: vi.fn() },
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
  token: 'token-1',
  refreshToken: 'refresh-1',
  user: adminUser,
  login: vi.fn(),
  logout: vi.fn(),
  ...overrides,
});

// The MUI TextField labels are not resolvable via getByLabelText in this MUI
// version, so the password inputs are addressed by their explicit ids.
const fillPasswordForm = (current: string, next: string, confirm: string) => {
  fireEvent.change(screen.getByDisplayValue('') || document.getElementById('current-password')!, { target: { value: current } });
  fireEvent.change(document.getElementById('current-password') as HTMLElement, { target: { value: current } });
  fireEvent.change(document.getElementById('new-password') as HTMLElement, { target: { value: next } });
  fireEvent.change(document.getElementById('confirm-new-password') as HTMLElement, { target: { value: confirm } });
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
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_API_BASE;
  });

  it('renders nothing and redirects to /login when there is no user (route guard)', () => {
    vi.mocked(useAuth).mockReturnValue(authed({ user: null, token: null, isAuthenticated: false }));
    const { container } = render(<UserProfilePageRoute />);
    expect(container).toBeEmptyDOMElement();
    expect(replaceMock).toHaveBeenCalledWith('/login');
  });

  it('renders the profile for any authenticated role (BASIC_USER is allowed)', async () => {
    vi.mocked(useAuth).mockReturnValue(authed({ user: basicUser }));
    vi.mocked(AuthService.getMe).mockResolvedValue(basicUser);
    render(<UserProfilePageRoute />);
    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.getByText('Username:')).toBeInTheDocument();
    expect(screen.getByText('Email:')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Role:')).toBeInTheDocument();
    expect(screen.getByText('BASIC_USER')).toBeInTheDocument();
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
    render(<UserProfilePageRoute />);
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
    await screen.findByText('admin');
    fillPasswordForm('old', 'newpass1', 'different');
    submitPasswordForm();
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(AuthService.changePassword).not.toHaveBeenCalled();
  });

  it('blocks submission when there is no auth token', async () => {
    vi.mocked(useAuth).mockReturnValue(authed({ token: null }));
    render(<UserProfilePageRoute />);
    await screen.findByText('admin');
    fillPasswordForm('old', 'newpass1', 'newpass1');
    submitPasswordForm();
    expect(await screen.findByText('You must be logged in to change your password.')).toBeInTheDocument();
    expect(AuthService.changePassword).not.toHaveBeenCalled();
  });

  it('changes the password, shows a success message, and clears the fields', async () => {
    render(<UserProfilePageRoute />);
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
    await screen.findByText('admin');
    fillPasswordForm('wrong', 'newpass1', 'newpass1');
    submitPasswordForm();
    expect(await screen.findByText('Old password is incorrect.')).toBeInTheDocument();
  });

  it('falls back to a generic message when the error message is empty', async () => {
    vi.mocked(AuthService.changePassword).mockRejectedValue(new Error(''));
    render(<UserProfilePageRoute />);
    await screen.findByText('admin');
    fillPasswordForm('old', 'newpass1', 'newpass1');
    submitPasswordForm();
    expect(await screen.findByText('Password change failed.')).toBeInTheDocument();
  });

  it('falls back to a generic message for a non-Error rejection', async () => {
    vi.mocked(AuthService.changePassword).mockRejectedValue('service unavailable');
    render(<UserProfilePageRoute />);
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
    await screen.findByText('admin');
    fillPasswordForm('old', 'newpass1', 'newpass1');
    submitPasswordForm();
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    await act(async () => {
      resolveChange({});
    });
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
    expect(await screen.findByText('Password changed successfully.')).toBeInTheDocument();
  });
});
