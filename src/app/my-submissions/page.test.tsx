import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import i18n from '@/i18n';
import type { ProblemType, SubmissionType } from '@/types';
import MySubmissionsPage from './page';

// Page tests for the /my-submissions port. Mocks:
// - ApiService (ProblemService.getProblems + SubmissionService.getSubmissions)
// - AuthContext.useAuth (configurable per test via mocks.auth)
// - next/navigation (ProtectedRoute uses useRouter)
// i18n runs for real (initialized by src/vitest.setup.ts), so t(key, default)
// renders the English fallback defaults exactly as in production.

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    token: 'test-access-token' as string | null,
    refreshToken: 'test-refresh-token' as string | null,
    user: {
      id: 1,
      username: 'tester',
      email: 'tester@example.com',
      role: 'BASIC_USER',
    } as object | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
  getProblems: vi.fn(),
  getSubmissions: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('@/services/ApiService', () => ({
  ProblemService: { getProblems: mocks.getProblems },
  SubmissionService: { getSubmissions: mocks.getSubmissions },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/my-submissions',
  useParams: () => ({}),
  useRouter: () => ({
    push: vi.fn(),
    replace: mocks.replace,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _Jsx = ReactElement | ReactNode;

const problem = (id: number, title_i18n: Record<string, string>): ProblemType =>
  ({ id, title_i18n, difficulty: 'EASY', status: 'APPROVED' }) as ProblemType;

const submission = (id: number, over: Partial<SubmissionType> = {}): SubmissionType => ({
  id,
  problem: { id: 1, title_i18n: { en: 'Problem One' } },
  language: 'python3',
  verdict: 'AC',
  submission_time: '2026-01-01T10:00:00Z',
  score: 100,
  ...over,
});

function setAuth(over: Partial<typeof mocks.auth> = {}) {
  mocks.auth.isAuthenticated = true;
  mocks.auth.token = 'test-access-token';
  mocks.auth.refreshToken = 'test-refresh-token';
  mocks.auth.user = { id: 1, username: 'tester', email: 'tester@example.com', role: 'BASIC_USER' };
  Object.assign(mocks.auth, over);
}

beforeEach(async () => {
  vi.clearAllMocks();
  setAuth();
  if (typeof window !== 'undefined') localStorage.clear();
  await i18n.changeLanguage('en');
  mocks.getProblems.mockResolvedValue([]);
  mocks.getSubmissions.mockResolvedValue([]);
});

// vitest runs without globals, so RTL cannot register its auto-cleanup.
afterEach(cleanup);

describe('MySubmissionsPage', () => {
  it('redirects anonymous visitors via ProtectedRoute (no content, no fetch)', async () => {
    setAuth({ isAuthenticated: false, token: null, user: null });
    render(<MySubmissionsPage />);
    await act(async () => {});
    expect(mocks.replace).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('My Submissions')).not.toBeInTheDocument();
    expect(mocks.getSubmissions).not.toHaveBeenCalled();
  });

  it('shows the inline login prompt when unauthenticated inside the guard', async () => {
    // Belt-and-braces branch: user passes ProtectedRoute but isAuthenticated is false.
    setAuth({ isAuthenticated: false, token: null });
    render(<MySubmissionsPage />);
    expect(await screen.findByText('Please login to view submissions.')).toBeInTheDocument();
    const loginLink = screen.getByRole('link', { name: 'Login' });
    expect(loginLink).toHaveAttribute('href', '/login');
    expect(mocks.getSubmissions).not.toHaveBeenCalled();
  });

  it('shows the loading spinner while fetching, then renders the table with rows', async () => {
    let resolveFetch: (v: SubmissionType[]) => void = () => {};
    mocks.getSubmissions.mockReturnValue(
      new Promise<SubmissionType[]>((res) => {
        resolveFetch = res;
      })
    );
    render(<MySubmissionsPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    resolveFetch([
      submission(101),
      submission(102, {
        problem: { id: 1, title_i18n: { en: 'Problem One' } },
        language: 'cpp17',
        verdict: 'WA',
        score: null,
      }),
      submission(103, { problem: { id: 5, title_i18n: {} }, score: 42 }),
    ]);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    expect(screen.getByText('My Submissions')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '101' })).toHaveAttribute('href', '/submissions/101');
    // Two rows reference the same problem -> assert every matching link.
    const problemLinks = screen.getAllByRole('link', { name: 'Problem One' });
    expect(problemLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of problemLinks) expect(link).toHaveAttribute('href', '/problems/1');
    // Problem with no titles at all falls back to "ID: n".
    expect(screen.getByRole('link', { name: 'ID: 5' })).toHaveAttribute('href', '/problems/5');
    expect(screen.getByText('cpp17')).toBeInTheDocument();
    expect(screen.getByText('WA')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument(); // null score
    expect(screen.getByText('100')).toBeInTheDocument(); // defined score
    expect(mocks.getProblems).toHaveBeenCalledTimes(1);
    // No pager for a single page.
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
  });

  it('renders the error message when loading submissions fails', async () => {
    mocks.getSubmissions.mockRejectedValue(new Error('Network down'));
    render(<MySubmissionsPage />);
    const el = await screen.findByText('Network down');
    expect(el).toHaveStyle({ color: 'rgb(255, 0, 0)' });
  });

  it('falls back to the default error text when the error has no message', async () => {
    mocks.getSubmissions.mockRejectedValue(new Error(''));
    render(<MySubmissionsPage />);
    await screen.findByText('Failed to load submissions.');
  });

  it('shows the empty state when there are no submissions', async () => {
    render(<MySubmissionsPage />);
    await screen.findByText('You have no submissions yet.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('populates the problem filter dropdown with localized titles and ID fallbacks', async () => {
    mocks.getProblems.mockResolvedValue([problem(1, { en: 'Problem One' }), problem(2, {})]);
    render(<MySubmissionsPage />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Problem One' })).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'ID: 2' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All Problems' })).toBeInTheDocument();
  });

  it('falls back to the English title when the active locale is missing (ro)', async () => {
    await i18n.changeLanguage('ro');
    mocks.getProblems.mockResolvedValue([problem(1, { en: 'English Only Title' })]);
    mocks.getSubmissions.mockResolvedValue([
      submission(101, { problem: { id: 1, title_i18n: { en: 'English Only Title' } } }),
    ]);
    render(<MySubmissionsPage />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'English Only Title' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'English Only Title' })).toBeInTheDocument();
  });

  it('refetches with problemId when a problem filter is selected', async () => {
    mocks.getProblems.mockResolvedValue([problem(2, { en: 'Second Problem' })]);
    render(<MySubmissionsPage />);
    await screen.findByRole('option', { name: 'Second Problem' });
    fireEvent.change(screen.getByLabelText('Filter by Problem:'), { target: { value: '2' } });
    await waitFor(() => expect(mocks.getSubmissions).toHaveBeenLastCalledWith({ problemId: 2 }));
  });

  it('passes a trimmed language filter and ignores whitespace-only input', async () => {
    render(<MySubmissionsPage />);
    await waitFor(() => expect(mocks.getSubmissions).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Filter by Language:'), { target: { value: ' python3 ' } });
    await waitFor(() => expect(mocks.getSubmissions).toHaveBeenLastCalledWith({ language: 'python3' }));
    fireEvent.change(screen.getByLabelText('Filter by Language:'), { target: { value: '   ' } });
    await waitFor(() => expect(mocks.getSubmissions).toHaveBeenLastCalledWith({}));
  });

  it('sorts by every key in both directions', async () => {
    const t1 = '2026-01-01T10:00:00Z';
    const t2 = '2026-01-02T10:00:00Z';
    mocks.getSubmissions.mockResolvedValue([
      submission(1, { language: 'python3', verdict: 'WA', submission_time: t1, score: 50 }),
      submission(2, { language: 'cpp17', verdict: 'AC', submission_time: t2, score: null }),
      submission(3, { language: 'python3', verdict: 'TLE', submission_time: t2, score: 10 }),
    ]);
    render(<MySubmissionsPage />);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    const firstRowId = () => screen.getAllByRole('row')[1].textContent?.[0];
    // Default: submission_time desc -> newest (id 2, stable before equal-time id 3).
    expect(firstRowId()).toBe('2');
    // language desc -> python3 first (equal languages hit the comparator's equal path).
    fireEvent.change(screen.getByLabelText('Sort by:'), { target: { value: 'language' } });
    expect(firstRowId()).toBe('1');
    // language asc -> cpp17 first.
    fireEvent.change(screen.getByLabelText('Order:'), { target: { value: 'asc' } });
    expect(firstRowId()).toBe('2');
    // score asc -> null maps to -Infinity.
    fireEvent.change(screen.getByLabelText('Sort by:'), { target: { value: 'score' } });
    expect(firstRowId()).toBe('2');
    // score desc -> 50 first.
    fireEvent.change(screen.getByLabelText('Order:'), { target: { value: 'desc' } });
    expect(firstRowId()).toBe('1');
    // verdict desc -> WA first.
    fireEvent.change(screen.getByLabelText('Sort by:'), { target: { value: 'verdict' } });
    expect(firstRowId()).toBe('1');
    // verdict asc -> AC first.
    fireEvent.change(screen.getByLabelText('Order:'), { target: { value: 'asc' } });
    expect(firstRowId()).toBe('2');
    // submission_time asc -> oldest first.
    fireEvent.change(screen.getByLabelText('Sort by:'), { target: { value: 'submission_time' } });
    expect(firstRowId()).toBe('1');
  });

  it('treats a nullish language as empty string when sorting (first operand)', async () => {
    // Comparator sees (nullish, 'python3'): the `?? ''` fallback fires for valA.
    mocks.getSubmissions.mockResolvedValue([
      submission(1, { language: null as unknown as string, submission_time: '2026-01-01T10:00:00Z' }),
      submission(2, { language: 'python3', submission_time: '2026-01-02T10:00:00Z' }),
    ]);
    render(<MySubmissionsPage />);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Sort by:'), { target: { value: 'language' } });
    // desc: '' sorts below 'python3', so id 2 comes first.
    expect(screen.getAllByRole('row')[1].textContent?.[0]).toBe('2');
  });

  it('treats a nullish language as empty string when sorting (second operand)', async () => {
    // Comparator sees ('python3', nullish): the `?? ''` fallback fires for valB.
    mocks.getSubmissions.mockResolvedValue([
      submission(1, { language: 'python3', submission_time: '2026-01-01T10:00:00Z' }),
      submission(2, { language: null as unknown as string, submission_time: '2026-01-02T10:00:00Z' }),
    ]);
    render(<MySubmissionsPage />);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Sort by:'), { target: { value: 'language' } });
    fireEvent.change(screen.getByLabelText('Order:'), { target: { value: 'asc' } });
    // asc: '' sorts before 'python3', so the nullish-language row leads.
    expect(screen.getAllByRole('row')[1].textContent?.[0]).toBe('2');
  });

  it('paginates: 10 per page, prev/next disabled at bounds, items-per-page switch', async () => {
    const subs = Array.from({ length: 11 }, (_, i) =>
      submission(i + 1, {
        problem: { id: 1, title_i18n: { en: 'P' } },
        submission_time: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
        score: 0,
      })
    );
    mocks.getSubmissions.mockResolvedValue(subs);
    render(<MySubmissionsPage />);
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(11)); // header + 10

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    const prev = screen.getByRole('button', { name: 'Previous' });
    const next = screen.getByRole('button', { name: 'Next' });
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();

    fireEvent.click(next);
    expect(screen.getAllByRole('row')).toHaveLength(2); // header + 1
    expect(prev).toBeEnabled();
    expect(next).toBeDisabled(); // on the last page

    fireEvent.click(prev);
    expect(screen.getAllByRole('row')).toHaveLength(11);

    // 25 per page -> single page, pager unmounted.
    fireEvent.change(screen.getByLabelText('Items per page:'), { target: { value: '25' } });
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(12));
    expect(screen.queryByText('Page 1 of 1')).not.toBeInTheDocument();
  });

  it('survives a problems-filter load failure (console.error only)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getProblems.mockRejectedValue(new Error('problems blew up'));
    render(<MySubmissionsPage />);
    await screen.findByText('You have no submissions yet.');
    expect(errSpy).toHaveBeenCalledWith('Failed to load problems for filter', expect.anything());
    expect(screen.getByRole('option', { name: 'All Problems' })).toBeInTheDocument();
    errSpy.mockRestore();
  });
});
