import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import type React from 'react';
import { AuthService } from '@/services/ApiService';
import type { LoginResponse } from '@/types/api';
import type { User } from '@/types';
import CompleteRegistrationPage from './page';

// Mocks follow the layout.test.tsx convention. useSearchParams is served from
// a mutable holder so individual tests can vary the ?email= query. i18n is the
// REAL instance from src/vitest.setup.ts; complete-registration keys are absent
// from resources, so assertions use the defaultValue copy baked into t() calls.
// Note the label for the username field resolves to 'Username' because that
// key IS present in the en resources.

const { authMock, routerMock, searchParamsMock } = vi.hoisted(() => ({
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
  searchParamsMock: {
    params: new URLSearchParams('email=oauth-user@example.com'),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/complete-registration',
  useSearchParams: () => searchParamsMock.params,
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

const validUser: User = {
  id: 9,
  username: 'oauth-user',
  email: 'oauth-user@example.com',
  role: 'BASIC_USER',
};
const tokenResponse: LoginResponse = {
  access: 'access-token',
  refresh: 'refresh-token',
  user: validUser,
};

const registerMock = vi.mocked(AuthService.register);

function renderCompleteRegistration() {
  return render(<CompleteRegistrationPage />);
}

function submitForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Complete Registration' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  searchParamsMock.params = new URLSearchParams('email=oauth-user@example.com');
});

// vitest runs with globals: false, so @testing-library/react's automatic
// cleanup never engages — without this, the DOM accumulates across tests and
// later queries find duplicate elements.
afterEach(cleanup);

describe('CompleteRegistrationPage', () => {
  it('redirects to /login when the email query parameter is missing', () => {
    searchParamsMock.params = new URLSearchParams();

    renderCompleteRegistration();

    expect(routerMock.push).toHaveBeenCalledWith('/login');
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('renders a disabled prefilled email field and an editable username field', () => {
    renderCompleteRegistration();

    expect(
      screen.getByRole('heading', { name: 'Complete Your Registration' })
    ).toBeInTheDocument();
    // Anchored regex: MUI `required` labels append an (aria-hidden) asterisk.
    const emailInput = screen.getByLabelText(/^Email Address/) as HTMLInputElement;
    expect(emailInput).toBeDisabled();
    expect(emailInput.value).toBe('oauth-user@example.com');

    const usernameInput = screen.getByLabelText(/^Username/) as HTMLInputElement;
    fireEvent.change(usernameInput, { target: { value: 'chosen-name' } });
    expect(usernameInput.value).toBe('chosen-name');
  });

  it('completes registration: logs the user in via context and navigates home', async () => {
    renderCompleteRegistration();
    registerMock.mockResolvedValueOnce(tokenResponse as unknown as never);

    fireEvent.change(screen.getByLabelText(/^Username/), { target: { value: 'chosen-name' } });
    submitForm();

    await waitFor(() => expect(authMock.login).toHaveBeenCalled());
    expect(registerMock).toHaveBeenCalledWith({
      email: 'oauth-user@example.com',
      username: 'chosen-name',
    });
    expect(authMock.login).toHaveBeenCalledWith('access-token', 'refresh-token', validUser);
    expect(routerMock.push).toHaveBeenCalledWith('/');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a spinner and disables the submit button while submitting', async () => {
    renderCompleteRegistration();
    let resolveRegister!: (value: LoginResponse) => void;
    registerMock.mockImplementationOnce(
      () =>
        new Promise<LoginResponse>((resolve) => {
          resolveRegister = resolve;
        }) as unknown as Promise<never>
    );

    // Hold the button reference before submitting: while isSubmitting is true
    // the label is replaced by a spinner, so a name-based query finds nothing.
    const submitButton = screen.getByRole('button', { name: 'Complete Registration' });
    fireEvent.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    await act(async () => {
      resolveRegister(tokenResponse);
    });

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/'));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it.each([
    ['response is undefined', undefined],
    ['response has no access token', {}],
    ['response has no refresh token', { access: 'a' }],
    ['response has no user', { access: 'a', refresh: 'r' }],
  ])('shows the completion error when %s', async (_label, partialResponse) => {
    const { unmount } = renderCompleteRegistration();
    registerMock.mockResolvedValueOnce(partialResponse as unknown as never);

    submitForm();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to complete registration.');
    expect(authMock.login).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalledWith('/');
    unmount();
  });

  it.each([
    ['an Error with a message', new Error('Username already registered.'), 'Username already registered.'],
    [
      'an Error with an empty message',
      new Error(''),
      'Failed to complete registration.',
    ],
    [
      'a non-Error rejection',
      'oauth provider offline',
      'Failed to complete registration.',
    ],
  ])('surfaces the API failure when the API rejects with %s', async (_label, rejection, expected) => {
    const { unmount } = renderCompleteRegistration();
    registerMock.mockRejectedValueOnce(rejection);

    submitForm();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(expected);
    expect(authMock.login).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalledWith('/');
    unmount();
  });
});
