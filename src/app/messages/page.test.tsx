import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import MessagesPage from './page';

// COM-5 inbox tests: thread list with unread badges + excerpts, the
// start-thread composer's policy-error mapping, the block list, and the
// moderator-only report queue section.

const api = vi.hoisted(() => ({
  getThreads: vi.fn(),
  startThread: vi.fn(),
  getBlocks: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
  getReports: vi.fn(),
  resolveReport: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  MessagingService: api,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

// ProtectedRoute uses the router for its redirect; jsdom has no App Router.
vi.mock('next/navigation', () => ({
  usePathname: () => '/messages',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));
// next/link is mocked to a plain anchor so the page renders without a live
// App Router context (the real Link expects one).
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));


const mocks = vi.hoisted(() => ({
  auth: { user: { id: 1, username: 'alice', role: 'BASIC' }, isAuthenticated: true, isHydrated: true },
}));

const conversation = (id: number, partial: Record<string, unknown> = {}) => ({
  id,
  other_user: { id: id + 10, username: `buddy_${id}` },
  unread_count: 0,
  last_message: null,
  created_at: '2026-10-28T10:00:00Z',
  updated_at: '2026-10-28T10:00:00Z',
  ...partial,
});

const report = (id: number) => ({
  id,
  message: {
    id: id + 100,
    sender: { id: 7, username: 'sender_x' },
    body: 'offensive text here',
    created_at: '2026-10-28T09:00:00Z',
    read_at: null,
  },
  reporter: { id: 2, username: 'reporter_y' },
  reason: 'ABUSE',
  details: '',
  status: 'OPEN',
  resolution_note: '',
  resolved_by: null,
  created_at: '2026-10-28T09:05:00Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getThreads.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  api.getBlocks.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  api.getReports.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
});

afterEach(cleanup);

describe('MessagesPage (inbox)', () => {
  it('renders threads with unread badges, excerpts and links', async () => {
    api.getThreads.mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [
        conversation(1, {
          unread_count: 3,
          last_message: { sender_id: 11, excerpt: 'salut, ai rezolvat tema?', created_at: '2026-10-28T10:00:00Z' },
        }),
        conversation(2),
      ],
    });
    render(<MessagesPage />);

    expect(await screen.findByText('buddy_1')).toBeInTheDocument();
    expect(screen.getByText('salut, ai rezolvat tema?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /buddy_1/ })).toHaveAttribute('href', '/messages/1');
    // Unread badge carries an accessible label (Q7: never color alone).
    expect(screen.getByLabelText('3 unread')).toBeInTheDocument();
    // Thread without messages shows the empty excerpt.
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });

  it('shows the empty state when no conversations exist', async () => {
    render(<MessagesPage />);
    expect(await screen.findByText('No conversations yet')).toBeInTheDocument();
  });

  it('maps policy errors from startThread to friendly messages', async () => {
    render(<MessagesPage />);
    const input = await screen.findByLabelText('Start a conversation with username');

    const cases: Array<[string, RegExp]> = [
      ['self', /cannot message yourself/i],
      ['blocked', /cannot receive your messages/i],
      ['minor_policy', /followed users or classmates/i],
      ['No such user.', /No user with that username/i],
      ['other', /Could not start the conversation/i],
    ];
    for (const [detail, matcher] of cases) {
      api.startThread.mockRejectedValueOnce(new Error(detail));
      fireEvent.change(input, { target: { value: 'someone' } });
      fireEvent.click(screen.getByTestId('msg-start'));
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(matcher));
    }
  });

  it('blocks list loads on demand and unblocks', async () => {
    api.getBlocks.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        { id: 5, blocked: { id: 42, username: 'creepy_user' }, created_at: '2026-10-28T08:00:00Z' },
      ],
    });
    api.unblockUser.mockResolvedValue({});
    render(<MessagesPage />);

    fireEvent.click(await screen.findByTestId('msg-blocks-toggle'));
    expect(await screen.findByText('creepy_user')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Unblock creepy_user'));
    await waitFor(() => expect(api.unblockUser).toHaveBeenCalledWith(42));
  });

  it('hides the moderation queue from basic users', async () => {
    render(<MessagesPage />);
    await screen.findByText('No conversations yet');
    expect(screen.queryByTestId('msg-mod-queue')).not.toBeInTheDocument();
  });

  it('shows the report queue to moderators, with resolve', async () => {
    mocks.auth.user = { id: 1, username: 'mod', role: 'PROBLEM_VERIFIER' };
    api.getReports.mockResolvedValue({ count: 1, next: null, previous: null, results: [report(9)] });
    api.resolveReport.mockResolvedValue({ ...report(9), status: 'RESOLVED' });
    render(<MessagesPage />);

    const row = await screen.findByTestId('msg-report-9');
    expect(row).toHaveTextContent('sender_x');
    expect(row).toHaveTextContent('offensive text here');
    fireEvent.click(screen.getByTestId('msg-resolve-9'));
    await waitFor(() => expect(api.resolveReport).toHaveBeenCalledWith(9, 'resolved'));
  });

  it('shows the dismiss action', async () => {
    mocks.auth.user = { id: 1, username: 'mod', role: 'ADMIN' };
    api.getReports.mockResolvedValue({ count: 1, next: null, previous: null, results: [report(4)] });
    render(<MessagesPage />);
    await screen.findByTestId('msg-report-4');
    fireEvent.click(screen.getByTestId('msg-dismiss-4'));
    await waitFor(() => expect(api.resolveReport).toHaveBeenCalledWith(4, 'dismissed'));
  });
});
