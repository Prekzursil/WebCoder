import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import type React from 'react';
import { AuthService } from '@/services/ApiService';
import type { LoginResponse } from '@/types/api';
import type { User } from '@/types';
import LoginPage from './page';

// Mocks follow the layout.test.tsx convention: next/navigation hooks,
// AuthContext (pages render standalone, so only useAuth matters), and the
// ApiService (network-free data paths). i18n is the REAL instance set up by
// src/vitest.setup.ts, so assertions use the en resources / defaultValue copy.

const { authMock, routerMock } = vi.hoisted(() => ({
  authMock: {
    isAuthenticated: false,
    token: null,
    refreshToken: null,
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
  },
  routerMock: {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => authMock,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/services/ApiService', () => ({
  AuthService: {
    login: vi.fn(),
    register: vi.fn(),
    getMe: vi.fn(),
    getUser: vi.fn(),
    changePassword: vi.fn(),
  },
}));

const validUser: User = { id: 7, username: 'porter', email: 'porter@example.com', role: 'BASIC_USER' };
const fullLogin: LoginResponse = { access: 'access-token', refresh: 'refresh-token', user: validUser };

const loginMock = vi.mocked(AuthService.login);

function renderLogin() {
  return render(<LoginPage />);
}

function submitCredentials(username: string, password: string) {
  // Anchored regexes: MUI `required` labels append an (aria-hidden) asterisk
  // span, so an exact-string getByLabelText match fails.
  fireEvent.change(screen.getByLabelText(/^Username/), { target: { value: username } });
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

// vitest runs with globals: false, so @testing-library/react's automatic
// cleanup never engages — without this, the DOM accumulates across tests and
// later queries find duplicate elements.
afterEach(cleanup);

describe('LoginPage', () => {
  it('renders the login form with localized labels, social links, and register link', () => {
    renderLogin();

    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Username/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/)).toBeInTheDocument();
    expect(screen.getByText('Or login with')).toBeInTheDocument();
    // MUI Button with href renders an <a> (implicit link role), not a button.
    expect(screen.getByRole('link', { name: 'Google' })).toHaveAttribute(
      'href',
      'http://localhost:8000/accounts/google/login/'
    );
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'http://localhost:8000/accounts/github/login/'
    );
    expect(screen.getByRole('link', { name: 'Register here' })).toHaveAttribute('href', '/register');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reflects typed credentials in the controlled inputs', () => {
    renderLogin();

    const usernameInput = screen.getByLabelText(/^Username/) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/^Password/) as HTMLInputElement;

    fireEvent.change(usernameInput, { target: { value: 'Ada' } });
    fireEvent.change(passwordInput, { target: { value: 's3cret' } });

    expect(usernameInput.value).toBe('Ada');
    expect(passwordInput.value).toBe('s3cret');
  });

  it('logs in successfully: persists auth via context and navigates home', async () => {
    renderLogin();
    loginMock.mockResolvedValueOnce(fullLogin);

    submitCredentials('Ada', 's3cret');

    await waitFor(() => expect(authMock.login).toHaveBeenCalled());
    expect(loginMock).toHaveBeenCalledWith({ username: 'Ada', password: 's3cret' });
    expect(authMock.login).toHaveBeenCalledWith('access-token', 'refresh-token', validUser);
    expect(routerMock.push).toHaveBeenCalledWith('/');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a spinner and disables the submit button while logging in', async () => {
    renderLogin();
    let resolveLogin!: (value: LoginResponse) => void;
    loginMock.mockImplementationOnce(
      () => new Promise<LoginResponse>((resolve) => { resolveLogin = resolve; })
    );

    // Hold the button reference before submitting: while isSubmitting is true
    // the label is replaced by a spinner, so a name-based query finds nothing.
    fireEvent.change(screen.getByLabelText(/^Username/), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 's3cret' } });
    const submitButton = screen.getByRole('button', { name: 'Login' });
    fireEvent.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    await act(async () => {
      resolveLogin(fullLogin);
    });

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/'));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it.each([
    ['response is undefined', undefined],
    ['response has no access token', {}],
    ['response has no refresh token', { access: 'a' }],
    ['response has no user', { access: 'a', refresh: 'r' }],
  ])('shows the no-token error when %s', async (_label, partialResponse) => {
    const { unmount } = renderLogin();
    loginMock.mockResolvedValueOnce(partialResponse as unknown as LoginResponse);

    submitCredentials('Ada', 's3cret');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Login failed: No token received.');
    expect(authMock.login).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
    unmount();
  });

  it.each([
    ['an Error with a message', new Error('Invalid credentials.'), 'Invalid credentials.'],
    [
      'an Error with an empty message',
      new Error(''),
      'Login failed. Please check your credentials.',
    ],
    [
      'a non-Error rejection',
      'network down',
      'Login failed. Please check your credentials.',
    ],
  ])('surfaces the API failure when the API rejects with %s', async (_label, rejection, expected) => {
    const { unmount } = renderLogin();
    loginMock.mockRejectedValueOnce(rejection);

    submitCredentials('Ada', 'wrong-password');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(expected);
    expect(authMock.login).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
    unmount();
  });

  it('builds social-login URLs from NEXT_PUBLIC_API_BASE when set', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE', 'https://api.webcoder.example');
    // API_BASE_URL is a module-level const in api-config.ts, captured at import
    // time, so vi.stubEnv alone cannot change it. Reset the graph and re-import.
    vi.resetModules();
    const { default: FreshLoginPage } = await import('./page');
    render(<FreshLoginPage />);
    expect(screen.getByRole('link', { name: 'Google' })).toHaveAttribute(
      'href',
      'https://api.webcoder.example/accounts/google/login/'
    );
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://api.webcoder.example/accounts/github/login/'
    );
  });
});
