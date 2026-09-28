import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import type React from 'react';
import { AuthService } from '@/services/ApiService';
import type { RegisterResponse } from '@/types/api';
import RegisterPage from './page';

// Mocks follow the layout.test.tsx convention: next/navigation hooks and the
// ApiService. RegisterPage does not consume AuthContext, so it stays real
// (never mounted here). i18n is the REAL instance from src/vitest.setup.ts;
// register-page keys are absent from resources, so assertions use the
// defaultValue copy baked into the t() calls.

const { routerMock } = vi.hoisted(() => ({
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
  usePathname: () => '/register',
  useSearchParams: () => new URLSearchParams(),
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

const registerMock = vi.mocked(AuthService.register);

function renderRegister() {
  return render(<RegisterPage />);
}

function fillForm(username: string, email: string, password: string, password2: string) {
  // Anchored regexes: MUI `required` labels append an (aria-hidden) asterisk
  // span, so an exact-string getByLabelText match fails. /^Password/ must not
  // match "Confirm Password", hence the anchor.
  fireEvent.change(screen.getByLabelText(/^Username/), { target: { value: username } });
  fireEvent.change(screen.getByLabelText(/^Email Address/), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: password } });
  fireEvent.change(screen.getByLabelText(/^Confirm Password/), { target: { value: password2 } });
}

function submitForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

// vitest runs with globals: false, so @testing-library/react's automatic
// cleanup never engages — without this, the DOM accumulates across tests and
// later queries find duplicate elements.
afterEach(cleanup);

describe('RegisterPage', () => {
  it('renders the register form with labels, social links, and login link', () => {
    renderRegister();

    expect(screen.getByRole('heading', { name: 'Register' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Username/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email Address/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Confirm Password/)).toBeInTheDocument();
    expect(screen.getByText('Or sign up with:')).toBeInTheDocument();
    // MUI Button with href renders an <a> (implicit link role), not a button.
    expect(screen.getByRole('link', { name: 'Google' })).toHaveAttribute(
      'href',
      'http://localhost:8000/api/v1/auth/google/login/'
    );
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'http://localhost:8000/api/v1/auth/github/login/'
    );
    expect(screen.getByRole('link', { name: 'Login here' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reflects typed values in the four controlled inputs', () => {
    renderRegister();

    fillForm('Grace', 'grace@example.com', 'pw-one', 'pw-two');

    expect((screen.getByLabelText(/^Username/) as HTMLInputElement).value).toBe('Grace');
    expect((screen.getByLabelText(/^Email Address/) as HTMLInputElement).value).toBe(
      'grace@example.com'
    );
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('pw-one');
    expect((screen.getByLabelText(/^Confirm Password/) as HTMLInputElement).value).toBe('pw-two');
  });

  it('blocks submission with an error when passwords do not match (no API call)', () => {
    renderRegister();

    fillForm('Grace', 'grace@example.com', 'pw-one', 'pw-TWO-different');
    submitForm();

    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.');
    expect(registerMock).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('registers successfully: shows the success alert, then redirects to /login after 2s', async () => {
    vi.useFakeTimers();
    try {
      renderRegister();
      registerMock.mockResolvedValueOnce({ user: undefined, message: 'ok' } as unknown as RegisterResponse);

      fillForm('Grace', 'grace@example.com', 'pw-one', 'pw-one');
      submitForm();

      // Flush the mocked promise + React state updates (fake timers freeze
      // waitFor's polling, so the act flush is explicit).
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(registerMock).toHaveBeenCalledWith({
        username: 'Grace',
        email: 'grace@example.com',
        password: 'pw-one',
        password2: 'pw-one',
      });
      expect(
        screen.getByText('Registration successful! Redirecting to login...')
      ).toBeInTheDocument();
      expect(routerMock.push).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(routerMock.push).toHaveBeenCalledWith('/login');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a spinner and disables the submit button while registering', async () => {
    renderRegister();
    let resolveRegister!: (value: RegisterResponse) => void;
    registerMock.mockImplementationOnce(
      () => new Promise<RegisterResponse>((resolve) => { resolveRegister = resolve; })
    );

    fillForm('Grace', 'grace@example.com', 'pw-one', 'pw-one');
    // Hold the button reference before submitting: while isSubmitting is true
    // the label is replaced by a spinner, so a name-based query finds nothing.
    const submitButton = screen.getByRole('button', { name: 'Register' });
    fireEvent.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    await act(async () => {
      resolveRegister({ user: undefined, message: 'ok' } as unknown as RegisterResponse);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('Registration successful! Redirecting to login...')).toBeInTheDocument();
  });

  it.each([
    ['an Error with a message', new Error('Username already taken.'), 'Username already taken.'],
    [
      'an Error with an empty message',
      new Error(''),
      'Registration failed. Please try again.',
    ],
    [
      'a non-Error rejection',
      { status: 500 },
      'Registration failed. Please try again.',
    ],
  ])('surfaces the API failure when the API rejects with %s', async (_label, rejection, expected) => {
    const { unmount } = renderRegister();
    registerMock.mockRejectedValueOnce(rejection);

    fillForm('Grace', 'grace@example.com', 'pw-one', 'pw-one');
    submitForm();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(expected);
    expect(routerMock.push).not.toHaveBeenCalled();
    unmount();
  });

  it('builds social-signup URLs from NEXT_PUBLIC_API_BASE when set', () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE', 'https://api.webcoder.example');
    renderRegister();

    expect(screen.getByRole('link', { name: 'Google' })).toHaveAttribute(
      'href',
      'https://api.webcoder.example/api/v1/auth/google/login/'
    );
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://api.webcoder.example/api/v1/auth/github/login/'
    );
  });
});
