import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import type React from 'react';
import { AuthService } from '@/services/ApiService';
import ForgotPasswordPage from './page';

// layout.test.tsx conventions: navigation hooks + ApiService mocked, real
// i18n instance (en resources), React 18 act-wrapped events.

const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/forgot-password',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/services/ApiService', () => ({
  AuthService: {
    requestPasswordReset: vi.fn(),
    confirmPasswordReset: vi.fn(),
  },
}));

const requestMock = vi.mocked(AuthService.requestPasswordReset);

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it('renders the email form', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByText('Reset your password')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email address/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeInTheDocument();
  });

  it('submits the email and shows the account-agnostic confirmation', async () => {
    requestMock.mockResolvedValueOnce({ detail: 'sent' });
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText(/^Email address/), {
      target: { value: 'learner@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    });
    expect(requestMock).toHaveBeenCalledWith('learner@example.com');
    // No enumeration leak: the same copy regardless of the backend outcome.
    expect(
      screen.getByText(/If that email belongs to an account, a reset link is on its way/),
    ).toBeInTheDocument();
  });

  it('surfaces the API error and keeps the form retryable', async () => {
    requestMock.mockRejectedValueOnce(new Error('SMTP relay down'));
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText(/^Email address/), {
      target: { value: 'learner@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    });
    expect(screen.getByTestId('forgot-password-error').textContent).to.contain('SMTP relay down');
    // The form is still there — the user can retry.
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeInTheDocument();
    expect(requestMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    });
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  it('links back to login', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole('link', { name: 'Back to login' }).getAttribute('href')).to.equal(
      '/login',
    );
  });
});
