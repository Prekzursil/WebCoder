import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import type React from 'react';
import { AuthService } from '@/services/ApiService';
import ResetPasswordPage from './page';

// The page reads uid/token from the query string, so the navigation mock
// hands each render a controllable search string.
const searchParams = new URLSearchParams();
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
  usePathname: () => '/reset-password',
  useSearchParams: () => searchParams,
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

const confirmMock = vi.mocked(AuthService.confirmPasswordReset);

function fillAndSubmit(password: string, confirm: string) {
  fireEvent.change(screen.getByLabelText(/^New password/), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText(/^Confirm new password/), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams.set('uid', 'mock-uid');
    searchParams.set('token', 'mock-token');
  });
  afterEach(cleanup);

  it('shows the invalid-link state without uid/token in the URL', () => {
    searchParams.delete('uid');
    searchParams.delete('token');
    render(<ResetPasswordPage />);
    expect(screen.getByTestId('reset-password-invalid')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Request a new link' }).getAttribute('href')
    ).to.equal('/forgot-password');
    // The form never mounts — no password fields to fill.
    expect(screen.queryByLabelText(/^New password/)).not.toBeInTheDocument();
  });

  it('rejects mismatched passwords client-side before any API call', async () => {
    render(<ResetPasswordPage />);
    await act(async () => {
      fillAndSubmit('NewPass-2026!y', 'DifferentPass-2026!z');
    });
    expect(confirmMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('reset-password-error').textContent).to.contain(
      'do not match'
    );
  });

  it('confirms with uid/token from the URL and reports success', async () => {
    confirmMock.mockResolvedValueOnce({ detail: 'ok' });
    render(<ResetPasswordPage />);
    await act(async () => {
      fillAndSubmit('NewPass-2026!y', 'NewPass-2026!y');
    });
    expect(confirmMock).toHaveBeenCalledWith(
      'mock-uid',
      'mock-token',
      'NewPass-2026!y',
      'NewPass-2026!y'
    );
    expect(screen.getByTestId('reset-password-done').textContent).to.contain(
      'Password updated'
    );
    expect(screen.getByRole('link', { name: 'Back to login' }).getAttribute('href')).to.equal(
      '/login'
    );
  });

  it('routes a rejected confirm (expired token) to the invalid-link state', async () => {
    confirmMock.mockRejectedValueOnce(new Error('Invalid value'));
    render(<ResetPasswordPage />);
    await act(async () => {
      fillAndSubmit('NewPass-2026!y', 'NewPass-2026!y');
    });
    expect(screen.getByTestId('reset-password-invalid').textContent).to.contain(
      'Invalid value'
    );
    expect(
      screen.getByRole('link', { name: 'Request a new link' }).getAttribute('href')
    ).to.equal('/forgot-password');
  });
});
