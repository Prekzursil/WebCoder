import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { cookies } from 'next/headers';
import { ProblemType, User } from '@/types';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('./_lib/problems-api', () => ({
  getProblems: vi.fn(),
  getProblemsPage: vi.fn(),
}));

// ProblemsListClient now reads URL state (useSearchParams/useRouter [F3]) and
// the auth context (status facet gating [F7]) — both need mocks outside a
// live Next app. The auth mock is configurable per test via mocks.auth.
const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: false,
    token: null as string | null,
    refreshToken: null as string | null,
    user: null as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/problems',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

import ProblemsListPage, { generateMetadata } from './page';
import { getProblemsPage } from './_lib/problems-api';

function mockLocale(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === 'i18nextLng' ? (value === undefined ? undefined : { value }) : undefined,
  } as Awaited<ReturnType<typeof cookies>>);
}

function problem(partial: Partial<ProblemType>): ProblemType {
  return {
    id: 1,
    title_i18n: { en: 'Problem' },
    difficulty: 'EASY',
    status: 'APPROVED',
    ...partial,
  } as ProblemType;
}

afterEach(cleanup);

beforeEach(() => {
  mockLocale(undefined);
  vi.mocked(getProblemsPage).mockReset();
});

describe('ProblemsListPage (route "/problems")', () => {
  it('renders the header and one localized link per problem', async () => {
    vi.mocked(getProblemsPage).mockResolvedValue({ count: [
      problem({ id: 1, title_i18n: { en: 'Two Sum' } }),
      problem({ id: 2, title_i18n: { en: 'N-Queens' }, difficulty: 'HARD', status: 'PENDING_APPROVAL' }),
    ].length, next: null, previous: null, results: [
      problem({ id: 1, title_i18n: { en: 'Two Sum' } }),
      problem({ id: 2, title_i18n: { en: 'N-Queens' }, difficulty: 'HARD', status: 'PENDING_APPROVAL' }),
    ] });
    render(await ProblemsListPage());

    expect(screen.getByRole('heading', { name: 'Problems' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Two Sum' });
    expect(link.getAttribute('href')).toBe('/problems/1');
    expect(screen.getByRole('link', { name: 'N-Queens' }).getAttribute('href')).toBe('/problems/2');

    // Difficulty/status badge labels stay raw backend enums by design (no
    // dictionary entries); the status column is hidden for anonymous visitors
    // (F7 — they only ever see APPROVED). Row 0 is the header row.
    const items = screen.getAllByRole('row').slice(1);
    expect(items[0].textContent).toContain('Two Sum');
    expect(items[0].textContent).toContain('EASY');
    expect(items[0].textContent).not.toContain('APPROVED');
    expect(items[1].textContent).toContain('N-Queens');
    expect(items[1].textContent).toContain('HARD');
    // The # column shows the stable problem id, not the filtered index (F5).
    expect(items[0].textContent).toContain('1');
    expect(items[1].textContent).toContain('2');
  });

  it('resolves titles through the ro -> en -> "Problem ID: n" fallback chain', async () => {
    vi.mocked(getProblemsPage).mockResolvedValue({ count: [
      problem({ id: 1, title_i18n: { en: 'English only', ro: 'Românesc' } }),
      problem({ id: 2, title_i18n: { en: 'English only' } }),
      problem({ id: 3, title_i18n: {} }),
    ].length, next: null, previous: null, results: [
      problem({ id: 1, title_i18n: { en: 'English only', ro: 'Românesc' } }),
      problem({ id: 2, title_i18n: { en: 'English only' } }),
      problem({ id: 3, title_i18n: {} }),
    ] });
    mockLocale('ro');
    render(await ProblemsListPage());

    expect(screen.getByRole('link', { name: 'Românesc' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'English only' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Problem #3' })).toBeInTheDocument();
  });

  it('renders the localized header for Romanian visitors', async () => {
    vi.mocked(getProblemsPage).mockResolvedValue({ count: [].length, next: null, previous: null, results: [] });
    mockLocale('ro');
    render(await ProblemsListPage());

    expect(screen.getByRole('heading', { name: 'Probleme' })).toBeInTheDocument();
  });

  it('renders the empty state when the catalog has no problems', async () => {
    vi.mocked(getProblemsPage).mockResolvedValue({ count: [].length, next: null, previous: null, results: [] });
    render(await ProblemsListPage());

    expect(screen.getByText('No problems available at the moment.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows the status column and facet for privileged roles (F7)', async () => {
    mocks.auth.isAuthenticated = true;
    mocks.auth.token = 'tok';
    mocks.auth.user = { id: 1, username: 'v', email: 'v@example.com', role: 'PROBLEM_VERIFIER' } as User;
    vi.mocked(getProblemsPage).mockResolvedValue({ count: [
      problem({ id: 1, title_i18n: { en: 'Two Sum' } }),
      problem({ id: 2, title_i18n: { en: 'Draft One' }, status: 'DRAFT' }),
    ].length, next: null, previous: null, results: [
      problem({ id: 1, title_i18n: { en: 'Two Sum' } }),
      problem({ id: 2, title_i18n: { en: 'Draft One' }, status: 'DRAFT' }),
    ] });
    render(await ProblemsListPage());

    const items = screen.getAllByRole('row').slice(1);
    expect(items[0].textContent).toContain('APPROVED');
    expect(items[1].textContent).toContain('DRAFT');
    // Real backend choices in the facet; 'rejected' is gone.
    expect(screen.getByRole('button', { name: 'pending_approval' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'rejected' })).not.toBeInTheDocument();
    mocks.auth.isAuthenticated = false;
    mocks.auth.token = null;
    mocks.auth.user = null;
  });

  it('propagates fetch failures to the error boundary (red paragraph path)', async () => {
    // page.tsx now try/catches getProblems and hands the message to the client as
    // `fetchError` rather than letting it reach the error boundary.
    vi.mocked(getProblemsPage).mockRejectedValue(new Error('Failed to load problems.'));
    const element = await ProblemsListPage();
    // The client island is wrapped in <Suspense> (F3 needs useSearchParams);
    // fetchError lives on the child.
    const client = element.props.children as { props: { fetchError: string | null } };
    expect(client.props.fetchError).toBe('Failed to load problems.');
  });

  it('exposes catalog metadata', async () => {
    mockLocale(undefined);
    const metadata = await generateMetadata();
    expect(metadata.title).toBe('Problems');
    expect(metadata.description).toMatch(/problem catalog/i);
  });

  it('localizes the metadata title for Romanian visitors', async () => {
    mockLocale('ro');
    const metadata = await generateMetadata();
    expect(metadata.title).toBe('Probleme');
  });
});
