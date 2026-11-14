// [Wave D atestats] The /certificates holder list: cards render from the
// paginated mine endpoint, revoked rows badge honestly, the empty state
// names the two honest ways to earn one, and API failures surface as an
// error (never as a fake empty list).

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { CertificateType } from '@/types/api';
import CertificatesPage from './page';

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    token: 'test-access-token' as string | null,
    user: { id: 1, username: 'tester', email: 't@example.com', role: 'BASIC_USER' } as object | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
  getMyCertificates: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  prefetch: vi.fn(),
  path: '/',
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => mocks.auth }));

vi.mock('@/services/ApiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/ApiService')>();
  return {
    ...actual,
    collectAllPages: async (fetchPage: (page: number) => Promise<{ results: unknown[] }>) => {
      const response = await fetchPage(1);
      return response.results;
    },
    CertificateService: { getMyCertificates: mocks.getMyCertificates },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push, prefetch: mocks.prefetch }),
  usePathname: () => mocks.path,
}));

const CERT: CertificateType = {
  uuid: 'aaaaaaaa-0000-0000-0000-000000000001',
  serial: 'WC-2026-000007',
  kind: 'CONTEST_PARTICIPATION',
  status: 'VALID',
  holder: 'tester',
  details: { rank: 3, rating_after: 1500, contest_title_en: 'Winter Cup' },
  issued_at: '2026-11-01T12:00:00Z',
  revoked_at: null,
  revoked_reason: '',
};

const REVOKED: CertificateType = {
  ...CERT,
  uuid: 'aaaaaaaa-0000-0000-0000-000000000002',
  serial: 'WC-2026-000008',
  status: 'REVOKED',
  revoked_reason: 'ratings discarded',
};

const pageOf = (results: CertificateType[]) => ({
  count: results.length,
  next: null,
  previous: null,
  results,
});

beforeEach(() => {
  mocks.getMyCertificates.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('CertificatesPage [Wave D]', () => {
  it('lists the holder certificates with kind, achievement and serial', async () => {
    mocks.getMyCertificates.mockResolvedValue(pageOf([CERT]));
    render(<CertificatesPage />);
    expect(await screen.findByTestId('certificates-list')).toBeTruthy();
    expect(screen.getByTestId('certificate-serial-aaaaaaaa-0000-0000-0000-000000000001')).toBeTruthy();
    expect(screen.getByText('Contest participation')).toBeTruthy();
    expect(screen.getByText(/Winter Cup/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View / verify' })).toBeTruthy();
  });

  it('badges revoked rows while still listing them', async () => {
    mocks.getMyCertificates.mockResolvedValue(pageOf([REVOKED]));
    render(<CertificatesPage />);
    expect(await screen.findByText('Revoked')).toBeTruthy();
    expect(screen.getByTestId('certificate-serial-aaaaaaaa-0000-0000-0000-000000000002')).toBeTruthy();
  });

  it('shows the honest empty state when nothing is earned yet', async () => {
    mocks.getMyCertificates.mockResolvedValue(pageOf([]));
    render(<CertificatesPage />);
    expect(await screen.findByTestId('certificates-empty')).toBeTruthy();
    expect(screen.getByText(/first 10 problems/)).toBeTruthy();
  });

  it('surfaces API failures as an error, never as an empty list', async () => {
    mocks.getMyCertificates.mockRejectedValue(new Error('network down'));
    render(<CertificatesPage />);
    expect(await screen.findByTestId('certificates-error')).toBeTruthy();
    expect(screen.getByText('Failed to load certificates.')).toBeTruthy();
  });
});
