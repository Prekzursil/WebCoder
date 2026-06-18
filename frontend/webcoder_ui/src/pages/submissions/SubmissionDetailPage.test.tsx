import React from 'react';
import { screen, waitFor, act } from '@testing-library/react';
import SubmissionDetailPage from './SubmissionDetailPage';
import { renderWithProviders, seedAuthUser, makeUser } from '../../test-utils';
import { SubmissionService } from '../../services/ApiService';

let mockParams: { submissionId?: string } = { submissionId: '7' };
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => mockParams,
}));
jest.mock('../../services/ApiService', () => ({
  SubmissionService: { getSubmissionDetail: jest.fn() },
  AuthService: { getMe: jest.fn(() => new Promise(() => undefined)) },
}));
// react-syntax-highlighter is heavy and irrelevant to behaviour under test.
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({ children }: { children: React.ReactNode }) => <pre>{children}</pre>,
}));
jest.mock('react-syntax-highlighter/dist/cjs/styles/prism', () => ({ vscDarkPlus: {} }));

const getDetail = SubmissionService.getSubmissionDetail as jest.Mock;

const submission = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 7,
  problem: { id: 3, title_i18n: { en: 'Problem X' } },
  language: 'python3',
  verdict: 'AC',
  submission_time: '2024-02-01T10:00:00Z',
  score: 100,
  code: 'print(1)',
  execution_time_ms: 12,
  memory_used_kb: 2048,
  user: { id: 1, username: 'alice' },
  ...overrides,
});

describe('SubmissionDetailPage', () => {
  beforeEach(() => {
    mockParams = { submissionId: '7' };
    getDetail.mockReset();
    seedAuthUser(makeUser({ id: 1 }));
  });
  afterEach(() => {
    localStorage.clear();
    jest.useRealTimers();
  });

  it('shows the loading spinner before the submission resolves', () => {
    getDetail.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<SubmissionDetailPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders the full submission detail for a finished verdict', async () => {
    getDetail.mockResolvedValue({ data: submission() });
    renderWithProviders(<SubmissionDetailPage />);
    expect(await screen.findByText(/Submission Detail/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Problem X' })).toHaveAttribute(
      'href',
      '/problems/3',
    );
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('python3')).toBeInTheDocument();
    expect(screen.getByText('print(1)')).toBeInTheDocument();
    expect(screen.getByText(/12 ms/)).toBeInTheDocument();
    expect(screen.getByText(/2048 KB/)).toBeInTheDocument();
  });

  it('falls back to the english title then the problem id', async () => {
    getDetail.mockResolvedValueOnce({
      data: submission({ problem: { id: 3, title_i18n: {} } }),
    });
    renderWithProviders(<SubmissionDetailPage />);
    expect(await screen.findByRole('link', { name: 'ID: 3' })).toBeInTheDocument();
  });

  it('shows a dash score, no overall time/memory and no user when those are absent', async () => {
    getDetail.mockResolvedValue({
      data: submission({
        score: null,
        execution_time_ms: null,
        memory_used_kb: null,
        user: undefined,
      }),
    });
    renderWithProviders(<SubmissionDetailPage />);
    await screen.findByText(/Submission Detail/);
    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.queryByText(/User:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Execution Time/)).not.toBeInTheDocument();
  });

  it('renders test case results and the judge summary', async () => {
    getDetail.mockResolvedValue({
      data: submission({
        detailed_feedback: 'All good',
        test_results: [
          {
            id: 1,
            test_case_details: { id: 11, order: 1, is_sample: true, points: 10 },
            verdict: 'WA',
            execution_time_ms: 5,
            memory_used_kb: 100,
            actual_output: 'x'.repeat(250),
          },
          {
            id: 2,
            test_case_details: { id: 12, is_sample: false, points: 5 },
            verdict: 'RE',
            execution_time_ms: null,
            memory_used_kb: null,
            error_output: 'boom',
          },
        ],
      }),
    });
    renderWithProviders(<SubmissionDetailPage />);
    expect(await screen.findByText('Test Case Results')).toBeInTheDocument();
    expect(screen.getByText(/Sample/)).toBeInTheDocument();
    expect(screen.getByText(/All good/)).toBeInTheDocument();
    expect(screen.getByText(/Actual Output/)).toBeInTheDocument();
    expect(screen.getByText(/Error Output/)).toBeInTheDocument();
  });

  it('renders short outputs (no truncation) and CE/IE error verdicts', async () => {
    getDetail.mockResolvedValue({
      data: submission({
        test_results: [
          {
            id: 1,
            test_case_details: { id: 11, is_sample: false, points: 10 },
            verdict: 'WA',
            actual_output: 'short out',
          },
          {
            id: 4,
            test_case_details: { id: 14, is_sample: false, points: 5 },
            verdict: 'RE',
            actual_output: 'runtime stdout',
            error_output: 'runtime stderr',
          },
          {
            id: 2,
            test_case_details: { id: 12, is_sample: false, points: 5 },
            verdict: 'CE',
            error_output: 'e'.repeat(250),
          },
          {
            id: 3,
            test_case_details: { id: 13, is_sample: false, points: 5 },
            verdict: 'IE',
            error_output: 'short err',
          },
        ],
      }),
    });
    renderWithProviders(<SubmissionDetailPage />);
    expect(await screen.findByText('short out')).toBeInTheDocument();
    expect(screen.getByText('short err')).toBeInTheDocument();
  });

  it('shows the inline error note when a poll fails but a submission already loaded', async () => {
    jest.useFakeTimers();
    getDetail.mockResolvedValueOnce({ data: submission({ verdict: 'PENDING' }) });
    getDetail.mockRejectedValue(new Error('poll glitch'));
    renderWithProviders(<SubmissionDetailPage />);
    await waitFor(() => expect(screen.getByText(/Polling for updates/)).toBeInTheDocument());
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    await waitFor(() => expect(screen.getByText(/Note:/)).toBeInTheDocument());
  });

  it('maps known languages and falls back to plaintext for unknown ones', async () => {
    getDetail.mockResolvedValue({ data: submission({ language: 'rustlang' }) });
    renderWithProviders(<SubmissionDetailPage />);
    expect(await screen.findByText(/Submission Detail/)).toBeInTheDocument();
    expect(screen.getByText('rustlang')).toBeInTheDocument();
  });

  it('shows a polling indicator and refetches while the verdict is pending', async () => {
    jest.useFakeTimers();
    getDetail.mockResolvedValue({ data: submission({ verdict: 'PENDING' }) });
    renderWithProviders(<SubmissionDetailPage />);
    await waitFor(() => expect(screen.getByText(/Polling for updates/)).toBeInTheDocument());
    const callsBefore = getDetail.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(getDetail.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('stops polling once a finished verdict arrives', async () => {
    jest.useFakeTimers();
    getDetail.mockResolvedValueOnce({ data: submission({ verdict: 'RUNNING' }) });
    getDetail.mockResolvedValue({ data: submission({ verdict: 'AC' }) });
    renderWithProviders(<SubmissionDetailPage />);
    await waitFor(() => expect(screen.getByText(/Polling for updates/)).toBeInTheDocument());
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    await waitFor(() =>
      expect(screen.queryByText(/Polling for updates/)).not.toBeInTheDocument(),
    );
  });

  it('shows an auth-required error when there is no token', async () => {
    localStorage.clear();
    renderWithProviders(<SubmissionDetailPage />);
    expect(
      await screen.findByText('Authentication required to view submission details.'),
    ).toBeInTheDocument();
  });

  it('shows the error message when the initial fetch fails', async () => {
    getDetail.mockRejectedValue(new Error('not found'));
    renderWithProviders(<SubmissionDetailPage />);
    expect(await screen.findByText('not found')).toBeInTheDocument();
  });

  it('shows the default error message when the failure has no message', async () => {
    getDetail.mockRejectedValue({});
    renderWithProviders(<SubmissionDetailPage />);
    expect(await screen.findByText('Failed to load submission details.')).toBeInTheDocument();
  });

  it('shows a not-found message when the response data is empty', async () => {
    getDetail.mockResolvedValue({ data: null });
    renderWithProviders(<SubmissionDetailPage />);
    expect(await screen.findByText('Submission not found.')).toBeInTheDocument();
  });

  it('does nothing when there is no submission id in the route', () => {
    mockParams = {};
    renderWithProviders(<SubmissionDetailPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(getDetail).not.toHaveBeenCalled();
  });
});
