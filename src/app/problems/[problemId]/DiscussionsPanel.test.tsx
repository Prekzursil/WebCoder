import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import DiscussionsPanel from './DiscussionsPanel';
import type { User } from '@/types';

// COM-1 — per-problem discussions on the problem page: the ?problem_id=
// list, the start-a-thread form, and the login hint for anonymous users.

const api = vi.hoisted(() => ({
  getThreads: vi.fn(),
  createThread: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  ForumService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 7, username: 'tester', email: 't@x.com', role: 'BASIC' } as
      | User
      | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
  AuthContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    Consumer: ({ children }: { children: (value: unknown) => React.ReactNode }) =>
      children(mocks.auth),
    _currentValue: mocks.auth,
  },
}));

const THREADS = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 3,
      title: 'Is a deque needed?',
      problem: { id: 1, title_i18n: { en: 'Two Sum' } },
      author: 'someone',
      post_count: 4,
      is_pinned: false,
      is_locked: false,
      is_announcement: false,
      lang: 'en',
      last_activity: '2026-10-28T10:00:00Z',
      created_at: '2026-10-27T09:00:00Z',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('DiscussionsPanel (COM-1)', () => {
  it('lists the problem-scoped threads via ?problem_id=', async () => {
    api.getThreads.mockResolvedValue(THREADS);
    render(<DiscussionsPanel problemId={1} />);
    await waitFor(() =>
      expect(screen.getByText('Is a deque needed?')).toBeTruthy()
    );
    expect(api.getThreads).toHaveBeenCalledWith(
      expect.objectContaining({ problemId: 1, pageSize: 10 })
    );
  });

  it('starts a problem-scoped discussion through the form', async () => {
    api.getThreads.mockResolvedValue({ ...THREADS, results: [] });
    api.createThread.mockResolvedValue({});
    render(<DiscussionsPanel problemId={1} />);
    fireEvent.click(screen.getByTestId('discussions-start'));
    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: 'Stuck on the binary search' },
    });
    fireEvent.change(screen.getByLabelText(/your question/i), {
      target: { value: 'Which invariant holds?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /post/i }));
    await waitFor(() =>
      expect(api.createThread).toHaveBeenCalledWith({
        title: 'Stuck on the binary search',
        content: 'Which invariant holds?',
        problem: 1,
      })
    );
    // The list reloads after posting.
    await waitFor(() => expect(api.getThreads).toHaveBeenCalledTimes(2));
  });

  it('shows the login hint for anonymous visitors', async () => {
    mocks.auth.isAuthenticated = false;
    mocks.auth.user = null;
    api.getThreads.mockResolvedValue({ ...THREADS, results: [] });
    render(<DiscussionsPanel problemId={1} />);
    await waitFor(() =>
      expect(screen.getByText(/log in to join/i)).toBeTruthy()
    );
    mocks.auth.isAuthenticated = true;
    mocks.auth.user = { id: 7, username: 'tester', email: 't@x.com', role: 'BASIC' };
  });
});
