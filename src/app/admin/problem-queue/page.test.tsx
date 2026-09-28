import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import ProblemVerificationQueuePageRoute, { ProblemVerificationQueuePage } from './page';
import i18n from '@/i18n';
import { ProblemService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import type { ProblemType, User } from '@/types';

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
}));

// next/link is mocked to a plain anchor so the queue table renders without a
// live App Router context (the real Link expects one).
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock('@/services/ApiService', () => ({
  ProblemService: { getProblems: vi.fn(), approveProblem: vi.fn(), rejectProblem: vi.fn() },
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }));

// vitest runs with globals: false, so @testing-library/react cannot register
// its auto-cleanup — without this, rendered bodies accumulate across tests.
afterEach(cleanup);

const verifier: User = { id: 3, username: 'ver', email: 'ver@example.com', role: 'PROBLEM_VERIFIER' };

const problemA: ProblemType = {
  id: 5,
  title_i18n: { en: 'Two Sum', ro: 'Suma a Doua' },
  difficulty: 'EASY',
  status: 'PENDING_APPROVAL',
  author: { id: 9, username: 'creator1' },
};

// No 'en' title and no author: exercises the title fallback and the
// unknown-author fallback in the same table render.
const problemB: ProblemType = {
  id: 7,
  title_i18n: { ro: 'Doi Suma' },
  difficulty: 'HARD',
  status: 'PENDING_APPROVAL',
};

type AuthShape = ReturnType<typeof useAuth>;

const authed = (overrides: Partial<AuthShape> = {}): AuthShape => ({
  isAuthenticated: true,
  token: 'token-1',
  refreshToken: null,
  user: verifier,
  login: vi.fn(),
  logout: vi.fn(),
  ...overrides,
});

// Waits for a cell with the given text and returns its table row. The await
// matters: rows only exist after the fetch resolves.
const rowFor = async (title: string): Promise<HTMLElement> => {
  await screen.findByText(title);
  return screen.getByText(title).closest('td')!.closest('tr')! as HTMLElement;
};

describe('ProblemVerificationQueuePage (/admin/problem-queue)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    vi.mocked(useAuth).mockReturnValue(authed());
    vi.mocked(ProblemService.getProblems).mockResolvedValue([problemA, problemB]);
    vi.mocked(ProblemService.approveProblem).mockResolvedValue({ ...problemA });
    vi.mocked(ProblemService.rejectProblem).mockResolvedValue({ ...problemA });
  });

  it('renders nothing and redirects to / for a role outside ADMIN/PROBLEM_VERIFIER (route guard)', () => {
    vi.mocked(useAuth).mockReturnValue(
      authed({ user: { ...verifier, role: 'BASIC_USER' }, token: null, isAuthenticated: false })
    );
    const { container } = render(<ProblemVerificationQueuePageRoute />);
    expect(container).toBeEmptyDOMElement();
    expect(replaceMock).toHaveBeenCalledWith('/');
  });

  it('renders the authentication-required error when not authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue(authed({ isAuthenticated: false, token: null }));
    render(<ProblemVerificationQueuePage />);
    expect(await screen.findByText('Authentication required.')).toBeInTheDocument();
    expect(ProblemService.getProblems).not.toHaveBeenCalled();
  });

  it('keeps the spinner and never fetches when authenticated without a token', async () => {
    vi.mocked(useAuth).mockReturnValue(authed({ token: null }));
    render(<ProblemVerificationQueuePageRoute />);
    await Promise.resolve(); // let the effect run
    expect(ProblemService.getProblems).not.toHaveBeenCalled();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders the pending queue with localized titles, authors, difficulties, and edit links', async () => {
    render(<ProblemVerificationQueuePageRoute />);
    expect(await screen.findByText('Problem Verification Queue')).toBeInTheDocument();

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2 problems
    expect(screen.getByRole('columnheader', { name: 'Title' })).toBeInTheDocument();

    const rowA = await rowFor('Two Sum');
    expect(within(rowA).getByRole('link')).toHaveAttribute('href', '/problems/5/edit');
    expect(within(rowA).getByText('creator1')).toBeInTheDocument();
    expect(within(rowA).getByText('EASY')).toBeInTheDocument();

    const rowB = await rowFor('Unknown');
    expect(within(rowB).getByRole('link')).toHaveAttribute('href', '/problems/7/edit');
    expect(within(rowB).getByText('HARD')).toBeInTheDocument();
    expect(within(rowB).getByPlaceholderText('Required for rejection')).toBeInTheDocument();
  });

  it('renders the empty state when nothing is pending approval', async () => {
    vi.mocked(ProblemService.getProblems).mockResolvedValue([]);
    render(<ProblemVerificationQueuePageRoute />);
    expect(await screen.findByText('No problems are currently pending approval.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the API error message when fetching the queue fails', async () => {
    vi.mocked(ProblemService.getProblems).mockRejectedValue(new Error('down'));
    render(<ProblemVerificationQueuePageRoute />);
    expect(await screen.findByText('down')).toBeInTheDocument();
  });

  it('falls back to a generic message when the fetch error message is empty', async () => {
    vi.mocked(ProblemService.getProblems).mockRejectedValue(new Error(''));
    render(<ProblemVerificationQueuePageRoute />);
    expect(await screen.findByText('Failed to load pending problems.')).toBeInTheDocument();
  });

  it('falls back to a generic message for a non-Error fetch rejection', async () => {
    vi.mocked(ProblemService.getProblems).mockRejectedValue('oops');
    render(<ProblemVerificationQueuePageRoute />);
    expect(await screen.findByText('Failed to load pending problems.')).toBeInTheDocument();
  });

  it('approves without feedback, refetches, clears the feedback field, and shows a message', async () => {
    render(<ProblemVerificationQueuePageRoute />);
    const rowA = await rowFor('Two Sum');
    fireEvent.click(within(rowA).getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(ProblemService.approveProblem).toHaveBeenCalledWith(5, { feedback: undefined })
    );
    expect(await screen.findByText('Problem approved successfully!')).toBeInTheDocument();
    await waitFor(() => expect(ProblemService.getProblems).toHaveBeenCalledTimes(2));
  });

  it('approves with the typed feedback', async () => {
    render(<ProblemVerificationQueuePageRoute />);
    const rowA = await rowFor('Two Sum');
    fireEvent.change(within(rowA).getByPlaceholderText('Required for rejection'), {
      target: { value: 'looks good' },
    });
    fireEvent.click(within(rowA).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(ProblemService.approveProblem).toHaveBeenCalledWith(5, { feedback: 'looks good' }));
    // Feedback field is cleared after a successful action.
    await waitFor(async () => {
      const row = await rowFor('Two Sum');
      expect((within(row).getByPlaceholderText('Required for rejection') as HTMLTextAreaElement).value).toBe('');
    });
  });

  it('shows the action error when approval fails', async () => {
    vi.mocked(ProblemService.approveProblem).mockRejectedValue(new Error('denied'));
    render(<ProblemVerificationQueuePageRoute />);
    const rowA = await rowFor('Two Sum');
    fireEvent.click(within(rowA).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('denied')).toBeInTheDocument();
  });

  it('blocks rejection when no feedback was entered', async () => {
    render(<ProblemVerificationQueuePageRoute />);
    const rowA = await rowFor('Two Sum');
    fireEvent.click(within(rowA).getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Feedback is required for rejection.')).toBeInTheDocument();
    expect(ProblemService.rejectProblem).not.toHaveBeenCalled();
  });

  it('blocks rejection when the feedback is only whitespace', async () => {
    render(<ProblemVerificationQueuePageRoute />);
    const rowA = await rowFor('Two Sum');
    fireEvent.change(within(rowA).getByPlaceholderText('Required for rejection'), {
      target: { value: '   ' },
    });
    fireEvent.click(within(rowA).getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Feedback is required for rejection.')).toBeInTheDocument();
    expect(ProblemService.rejectProblem).not.toHaveBeenCalled();
  });

  it('rejects with the typed feedback, refetches, and shows a message', async () => {
    render(<ProblemVerificationQueuePageRoute />);
    const rowA = await rowFor('Two Sum');
    fireEvent.change(within(rowA).getByPlaceholderText('Required for rejection'), {
      target: { value: 'bad problem' },
    });
    fireEvent.click(within(rowA).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(ProblemService.rejectProblem).toHaveBeenCalledWith(5, { feedback: 'bad problem' }));
    expect(await screen.findByText('Problem rejected successfully!')).toBeInTheDocument();
    await waitFor(() => expect(ProblemService.getProblems).toHaveBeenCalledTimes(2));
  });

  it('shows the action error when rejection fails', async () => {
    vi.mocked(ProblemService.rejectProblem).mockRejectedValue(new Error('nope'));
    render(<ProblemVerificationQueuePageRoute />);
    const rowA = await rowFor('Two Sum');
    fireEvent.change(within(rowA).getByPlaceholderText('Required for rejection'), {
      target: { value: 'bad' },
    });
    fireEvent.click(within(rowA).getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('nope')).toBeInTheDocument();
  });

  it('requires authentication for approve/reject actions when the token disappears (rerender)', async () => {
    const { rerender } = render(<ProblemVerificationQueuePageRoute />);
    await rowFor('Two Sum');
    vi.mocked(useAuth).mockReturnValue(authed({ token: null }));
    rerender(<ProblemVerificationQueuePageRoute />);
    const rowAfter = await rowFor('Two Sum');
    // Reject first: its token check precedes the feedback check, so this
    // exercises the reject-handler auth branch even with empty feedback.
    fireEvent.click(within(rowAfter).getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Authentication required for this action.')).toBeInTheDocument();
    expect(ProblemService.rejectProblem).not.toHaveBeenCalled();
    fireEvent.click(within(rowAfter).getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(screen.getAllByText('Authentication required for this action.').length).toBeGreaterThan(0)
    );
    expect(ProblemService.approveProblem).not.toHaveBeenCalled();
  });

  it('shows the unauthorized message for a logged-in BASIC_USER (in-page role re-check)', async () => {
    vi.mocked(useAuth).mockReturnValue(authed({ user: { ...verifier, role: 'BASIC_USER' } }));
    render(<ProblemVerificationQueuePage />);
    // The fetch itself is not role-gated (only auth-gated); the render guard
    // is what blocks non-verifiers, so the queue is fetched and then hidden.
    expect(ProblemService.getProblems).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('You are not authorized to view this page.')).toBeInTheDocument();
  });

  it('shows the unauthorized message when there is no user object', async () => {
    vi.mocked(useAuth).mockReturnValue(authed({ user: null }));
    render(<ProblemVerificationQueuePage />);
    expect(await screen.findByText('You are not authorized to view this page.')).toBeInTheDocument();
  });
});
