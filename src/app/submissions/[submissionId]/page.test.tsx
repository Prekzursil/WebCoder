import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import i18n from '@/i18n';
import type { DetailedSubmissionType, SubmissionTestResultType } from '@/types';
import SubmissionDetailPage from './page';

// Page tests for the /submissions/[submissionId] port. Mocks:
// - ApiService (SubmissionService.getSubmissionDetail)
// - AuthContext.useAuth (configurable per test via mocks.auth)
// - next/navigation (useParams — configurable via mocks.params)
// - react-syntax-highlighter + its dist/cjs style module (asserts the language
//   mapping the page computes instead of running the real highlighter)
// i18n runs for real (initialized by src/vitest.setup.ts) so t(key, default)
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
  params: { submissionId: '42' } as Record<string, string>,
  getSubmissionDetail: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('@/services/ApiService', () => ({
  SubmissionService: { getSubmissionDetail: mocks.getSubmissionDetail },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/submissions/42',
  useParams: () => mocks.params,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('react-syntax-highlighter', () => ({
  Prism: (props: { language?: string; children?: React.ReactNode }) => (
    <pre data-testid="code-block" data-language={props.language}>
      {props.children}
    </pre>
  ),
}));

vi.mock('react-syntax-highlighter/dist/cjs/styles/prism', () => ({
  vscDarkPlus: {},
}));

const baseDetail = (over: Partial<DetailedSubmissionType> = {}): DetailedSubmissionType => ({
  id: 42,
  problem: { id: 7, title_i18n: { en: 'Problem One' } },
  user: { username: 'alice', id: 2 },
  language: 'python3',
  verdict: 'AC',
  submission_time: '2026-01-15T10:30:00Z',
  score: 100,
  code: 'print("hi")',
  execution_time_ms: 120,
  memory_used_kb: 2048,
  detailed_feedback: 'All good',
  test_results: [],
  ...over,
});

function setAuth(over: Partial<typeof mocks.auth> = {}) {
  mocks.auth.isAuthenticated = true;
  mocks.auth.token = 'test-access-token';
  mocks.auth.refreshToken = 'test-refresh-token';
  mocks.auth.user = { id: 1, username: 'tester', email: 'tester@example.com', role: 'BASIC_USER' };
  Object.assign(mocks.auth, over);
}

const pollingBadge = () =>
  screen.queryAllByText(
    (_, el) => !!el && el.tagName === 'SPAN' && (el.textContent ?? '').includes('Polling for updates')
  );

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const h4Text = (expected: string) => (_: string, el: Element | null) =>
  !!el && el.tagName === 'H4' && norm(el.textContent) === expected;
const pText = (expected: string) => (_: string, el: Element | null) =>
  !!el && el.tagName === 'P' && norm(el.textContent) === expected;

const findPre = (content: string) =>
  Array.from(document.querySelectorAll('pre')).find((el) => norm(el.textContent) === content);

beforeEach(async () => {
  vi.clearAllMocks();
  setAuth();
  mocks.params = { submissionId: '42' };
  localStorage.clear();
  await i18n.changeLanguage('en');
  mocks.getSubmissionDetail.mockResolvedValue(baseDetail());
});

// vitest runs without globals, so RTL cannot register its auto-cleanup.
afterEach(cleanup);

describe('SubmissionDetailPage', () => {
  it('requires auth: shows the error and never fetches without a token', async () => {
    setAuth({ isAuthenticated: false, token: null });
    render(<SubmissionDetailPage />);
    const el = await screen.findByText('Authentication required to view submission details.');
    expect(el).toHaveStyle({ color: 'rgb(255, 0, 0)' });
    expect(mocks.getSubmissionDetail).not.toHaveBeenCalled();
  });

  it('keeps showing the spinner when the route param is missing but a token exists', async () => {
    mocks.params = {};
    render(<SubmissionDetailPage />);
    await act(async () => {});
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(mocks.getSubmissionDetail).not.toHaveBeenCalled();
  });

  it('shows the loading spinner while the first fetch is in flight', async () => {
    mocks.getSubmissionDetail.mockReturnValue(new Promise(() => {}));
    render(<SubmissionDetailPage />);
    await act(async () => {});
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Submission not found.')).not.toBeInTheDocument();
  });

  it('renders the fetch error in red when the detail request fails', async () => {
    mocks.getSubmissionDetail.mockRejectedValue(new Error('Boom'));
    render(<SubmissionDetailPage />);
    const el = await screen.findByText('Boom');
    expect(el).toHaveStyle({ color: 'rgb(255, 0, 0)' });
  });

  it('falls back to the default error text when the error has no message', async () => {
    mocks.getSubmissionDetail.mockRejectedValue(new Error(''));
    render(<SubmissionDetailPage />);
    await screen.findByText('Failed to load submission details.');
  });

  it('renders "Submission not found." when the API resolves with no data', async () => {
    mocks.getSubmissionDetail.mockResolvedValue(null);
    render(<SubmissionDetailPage />);
    await screen.findByText('Submission not found.');
    expect(mocks.getSubmissionDetail).toHaveBeenCalledWith('42');
  });

  it('renders a full terminal (AC) submission', async () => {
    render(<SubmissionDetailPage />);
    await screen.findByText('Submission Detail #42');

    // No polling badge for a terminal verdict.
    expect(pollingBadge()).toHaveLength(0);

    expect(screen.getByRole('link', { name: 'Problem One' })).toHaveAttribute('href', '/problems/7');
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('python3')).toBeInTheDocument();
    expect(screen.getByText('AC')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();

    expect(screen.getByText('Execution Time (Overall):', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('120 ms', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Memory Used (Overall):', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('2048 KB', { exact: false })).toBeInTheDocument();

    // Code block with the mapped syntax language (python3 -> python).
    const code = screen.getByTestId('code-block');
    expect(code).toHaveAttribute('data-language', 'python');
    expect(code).toHaveTextContent('print("hi")');

    // Empty test_results -> no results header; feedback pre present.
    expect(screen.queryByText('Test Case Results')).not.toBeInTheDocument();
    expect(findPre('All good')).toBeDefined();
  });

  it('hides optional sections when fields are absent and maps unknown languages to plaintext', async () => {
    mocks.getSubmissionDetail.mockResolvedValue(
      baseDetail({
        user: undefined,
        language: 'ruby',
        score: null,
        execution_time_ms: null,
        memory_used_kb: null,
        detailed_feedback: undefined,
        test_results: undefined,
      })
    );
    render(<SubmissionDetailPage />);
    await screen.findByText('Submission Detail #42');

    expect(screen.queryByText('User:', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument(); // null score
    expect(screen.queryByText('Execution Time (Overall):', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText('Memory Used (Overall):', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText("Judge's Summary")).not.toBeInTheDocument();
    expect(screen.queryByText('Test Case Results')).not.toBeInTheDocument();
    expect(screen.getByTestId('code-block')).toHaveAttribute('data-language', 'plaintext');
  });

  it('maps cpp17 -> cpp for the syntax highlighter', async () => {
    mocks.getSubmissionDetail.mockResolvedValue(baseDetail({ language: 'cpp17' }));
    render(<SubmissionDetailPage />);
    await screen.findByText('Submission Detail #42');
    expect(screen.getByTestId('code-block')).toHaveAttribute('data-language', 'cpp');
  });

  it('renders test-case cards with verdict-conditional outputs and truncation', async () => {
    const tr = (over: Partial<SubmissionTestResultType>): SubmissionTestResultType =>
      ({
        id: 1,
        test_case_details: { id: 11, order: 1, is_sample: true, points: 10 },
        verdict: 'WA',
        execution_time_ms: 5,
        memory_used_kb: 512,
        actual_output: null,
        error_output: null,
        ...over,
      }) as SubmissionTestResultType;

    const results: SubmissionTestResultType[] = [
      // WA + long actual output -> shown, truncated to 200 chars with ellipsis.
      tr({ id: 1, actual_output: 'x'.repeat(250) }),
      // RE + short actual output (no ellipsis) + long error output (truncated);
      // no order -> falls back to test-case id; null exec time / undefined memory.
      tr({
        id: 2,
        test_case_details: { id: 12, is_sample: false, points: 5 },
        verdict: 'RE',
        execution_time_ms: null,
        memory_used_kb: undefined,
        actual_output: 'short',
        error_output: 'e'.repeat(250),
      }),
      // CE -> actual hidden, short error shown.
      tr({
        id: 3,
        test_case_details: { id: 13, order: 3, is_sample: false, points: 5 },
        verdict: 'CE',
        execution_time_ms: 7,
        memory_used_kb: 100,
        actual_output: 'hidden-ce',
        error_output: 'compile error short',
      }),
      // IE -> error shown; null actual hidden.
      tr({
        id: 4,
        test_case_details: { id: 14, order: 4, is_sample: false, points: 2 },
        verdict: 'IE',
        execution_time_ms: 1,
        memory_used_kb: 3,
        actual_output: null,
        error_output: 'ie-error',
      }),
      // AC -> both outputs hidden despite being present; null memory hidden.
      tr({
        id: 5,
        test_case_details: { id: 15, order: 5, is_sample: false, points: 1 },
        verdict: 'AC',
        execution_time_ms: 2,
        memory_used_kb: null,
        actual_output: 'ac-actual',
        error_output: 'ac-error',
      }),
      // WA + undefined execution time (present-check second operand false).
      tr({ id: 6, test_case_details: { id: 16, order: 6, is_sample: false, points: 1 }, execution_time_ms: undefined, memory_used_kb: 4 }),
      // RE + null error output -> hidden.
      tr({ id: 7, test_case_details: { id: 17, order: 7, is_sample: false, points: 1 }, verdict: 'RE', execution_time_ms: 9, memory_used_kb: 5, error_output: null }),
    ];

    mocks.getSubmissionDetail.mockResolvedValue(baseDetail({ verdict: 'WA', language: 'cpp17', test_results: results }));
    render(<SubmissionDetailPage />);
    await screen.findByText('Test Case Results');

    // Sample marker + order number.
    expect(screen.getByText(h4Text('Test Case #1 (Sample) - WA'))).toBeInTheDocument();
    // No order -> id fallback; not a sample.
    expect(screen.getByText(h4Text('Test Case #12 - RE'))).toBeInTheDocument();

    // Truncation behavior.
    expect(findPre('x'.repeat(200) + '...')).toBeDefined();
    expect(findPre('short')).toBeDefined();
    expect(findPre('e'.repeat(200) + '...')).toBeDefined();
    expect(findPre('compile error short')).toBeDefined();
    expect(findPre('ie-error')).toBeDefined();
    // Hidden outputs never render.
    expect(findPre('hidden-ce')).toBeUndefined();
    expect(findPre('ac-actual')).toBeUndefined();
    expect(findPre('ac-error')).toBeUndefined();

    // Points + time/memory lines.
    expect(screen.getByText(pText('Points: 10'))).toBeInTheDocument();
    expect(screen.getByText(pText('Time: 5 ms'))).toBeInTheDocument();
    expect(screen.getByText(pText('Memory: 512 KB'))).toBeInTheDocument();
    // Null/undefined time+memory are omitted (row 2 has none).
    expect(screen.queryByText('Points: undefined', { exact: false })).not.toBeInTheDocument();
  });

  it('falls back to the English problem title under the ro locale (java11 -> java)', async () => {
    await i18n.changeLanguage('ro');
    mocks.getSubmissionDetail.mockResolvedValue(
      baseDetail({ problem: { id: 9, title_i18n: { en: 'English Only' } }, language: 'java11' })
    );
    const { unmount } = render(<SubmissionDetailPage />);
    await screen.findByText('Detaliile Submisiei #42');
    expect(screen.getByRole('link', { name: 'English Only' })).toHaveAttribute('href', '/problems/9');
    expect(screen.getByTestId('code-block')).toHaveAttribute('data-language', 'java');
    unmount();

    // Title map completely empty -> "ID: n" fallback.
    mocks.getSubmissionDetail.mockResolvedValue(baseDetail({ problem: { id: 9, title_i18n: {} } }));
    render(<SubmissionDetailPage />);
    expect(await screen.findByRole('link', { name: 'ID: 9' })).toBeInTheDocument();
  });

  it('polls every 3s while PENDING and stops on a terminal verdict', async () => {
    vi.useFakeTimers();
    try {
      mocks.getSubmissionDetail
        .mockResolvedValueOnce(baseDetail({ verdict: 'PENDING' }))
        .mockResolvedValueOnce(baseDetail({ verdict: 'PENDING' }))
        .mockResolvedValueOnce(baseDetail({ verdict: 'AC' }));
      render(<SubmissionDetailPage />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(mocks.getSubmissionDetail).toHaveBeenCalledTimes(1);
      expect(pollingBadge()).toHaveLength(1);
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument(); // data already rendered

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(mocks.getSubmissionDetail).toHaveBeenCalledTimes(2);
      expect(pollingBadge()).toHaveLength(1); // still in flight -> keeps polling

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(mocks.getSubmissionDetail).toHaveBeenCalledTimes(3);
      expect(pollingBadge()).toHaveLength(0); // AC -> stopped

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(mocks.getSubmissionDetail).toHaveBeenCalledTimes(3); // interval cleared
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts and stops polling for a COMPILING verdict', async () => {
    vi.useFakeTimers();
    try {
      mocks.getSubmissionDetail
        .mockResolvedValueOnce(baseDetail({ verdict: 'COMPILING' }))
        .mockResolvedValueOnce(baseDetail({ verdict: 'AC' }));
      render(<SubmissionDetailPage />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(pollingBadge()).toHaveLength(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(mocks.getSubmissionDetail).toHaveBeenCalledTimes(2);
      expect(pollingBadge()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts and stops polling for a RUNNING verdict', async () => {
    vi.useFakeTimers();
    try {
      mocks.getSubmissionDetail
        .mockResolvedValueOnce(baseDetail({ verdict: 'RUNNING' }))
        .mockResolvedValueOnce(baseDetail({ verdict: 'AC' }));
      render(<SubmissionDetailPage />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(pollingBadge()).toHaveLength(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(mocks.getSubmissionDetail).toHaveBeenCalledTimes(2);
      expect(pollingBadge()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops polling and shows the orange note when a poll fails mid-flight', async () => {
    vi.useFakeTimers();
    try {
      mocks.getSubmissionDetail
        .mockResolvedValueOnce(baseDetail({ verdict: 'RUNNING' }))
        .mockRejectedValueOnce(new Error('judge exploded'));
      render(<SubmissionDetailPage />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(pollingBadge()).toHaveLength(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(mocks.getSubmissionDetail).toHaveBeenCalledTimes(2);
      expect(pollingBadge()).toHaveLength(0); // catch path stops polling
      expect(screen.getByText('Note: judge exploded')).toBeInTheDocument();
      // Submission data from the previous successful fetch is still rendered.
      expect(screen.getByText('Submission Detail #42')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
