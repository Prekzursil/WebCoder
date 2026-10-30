import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import MessageThreadPage from './page';

// COM-5 chat-view tests: history rendering as TEXT (XSS-safe contract),
// send flow, per-message reporting with reason pick, block/unblock, and
// mark-read firing on open.

const api = vi.hoisted(() => ({
  getThread: vi.fn(),
  getMessages: vi.fn(),
  sendMessage: vi.fn(),
  markRead: vi.fn(),
  reportMessage: vi.fn(),
  getBlocks: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  MessagingService: api,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

const mocks = vi.hoisted(() => ({
  auth: { user: { id: 1, username: 'alice', role: 'BASIC' }, isAuthenticated: true, isHydrated: true },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ threadId: '3' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));
// next/link is mocked to a plain anchor so the page renders without a live
// App Router context (the real Link expects one).
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));


const CONVERSATION = {
  id: 3,
  other_user: { id: 2, username: 'bob' },
  unread_count: 1,
  last_message: null,
  created_at: '2026-10-28T10:00:00Z',
  updated_at: '2026-10-28T10:00:00Z',
};

const message = (id: number, senderId: number, body: string) => ({
  id,
  sender: { id: senderId, username: senderId === 1 ? 'alice' : 'bob' },
  body,
  created_at: '2026-10-28T10:01:00Z',
  read_at: null,
});

function setup(messages = [message(10, 1, 'hello bob'), message(11, 2, '<script>alert(1)</script>')]) {
  api.getThread.mockResolvedValue(CONVERSATION);
  api.getMessages.mockResolvedValue({ next: null, previous: null, results: [...messages].reverse() });
  api.markRead.mockResolvedValue({ marked_read: 1 });
}

beforeEach(() => {
  vi.clearAllMocks();
  setup();
  // jsdom lacks scrollIntoView; the chat auto-scrolls to the newest row.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

describe('MessageThreadPage (chat)', () => {
  it('renders history oldest-first and marks the thread read on open', async () => {
    render(<MessageThreadPage />);
    expect(await screen.findByText('bob')).toBeInTheDocument();
    // The script TAG renders as literal text — the XSS-safe contract.
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(screen.getByText('hello bob')).toBeInTheDocument();
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith(3));
  });

  it('sends a message and appends the server echo', async () => {
    api.sendMessage.mockResolvedValue(message(12, 1, 'second reply'));
    render(<MessageThreadPage />);
    const box = await screen.findByLabelText('Write a message');
    fireEvent.change(box, { target: { value: 'second reply' } });
    fireEvent.click(screen.getByTestId('msg-send'));
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith(3, 'second reply'));
    await waitFor(() => expect(screen.getByText('second reply')).toBeInTheDocument());
  });

  it('maps send policy errors', async () => {
    api.sendMessage.mockRejectedValue(new Error('blocked'));
    render(<MessageThreadPage />);
    const box = await screen.findByLabelText('Write a message');
    fireEvent.change(box, { target: { value: 'try' } });
    fireEvent.click(screen.getByTestId('msg-send'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no longer message this user/i));
  });

  it('reports a received message with a picked reason', async () => {
    api.reportMessage.mockResolvedValue({} as never);
    render(<MessageThreadPage />);
    fireEvent.click(await screen.findByTestId('msg-report-btn-11'));
    fireEvent.click(await screen.findByTestId('msg-report-reason-GROOMING'));
    await waitFor(() => expect(api.reportMessage).toHaveBeenCalledWith(11, { reason: 'GROOMING' }));
    await waitFor(() =>
      expect(screen.getByTestId('msg-notice')).toHaveTextContent(/A moderator will review/i)
    );
  });

  it('surfaces duplicate-report 409 as a friendly notice', async () => {
    api.reportMessage.mockRejectedValue(new Error('You already reported this message.'));
    render(<MessageThreadPage />);
    fireEvent.click(await screen.findByTestId('msg-report-btn-11'));
    fireEvent.click(await screen.findByTestId('msg-report-reason-ABUSE'));
    await waitFor(() =>
      expect(screen.getByTestId('msg-notice')).toHaveTextContent(/already reported/i)
    );
  });

  it('does not offer reporting on your own messages', async () => {
    render(<MessageThreadPage />);
    await screen.findByText('hello bob');
    expect(screen.queryByTestId('msg-report-btn-10')).not.toBeInTheDocument();
  });

  it('toggles block and unblock with aria-pressed state', async () => {
    api.blockUser.mockResolvedValue({});
    api.unblockUser.mockResolvedValue({});
    render(<MessageThreadPage />);
    const toggle = await screen.findByTestId('msg-block-toggle');
    expect(toggle).toHaveTextContent('Block');
    fireEvent.click(toggle);
    await waitFor(() => expect(api.blockUser).toHaveBeenCalledWith({ userId: 2 }));
    await waitFor(() => expect(screen.getByTestId('msg-notice')).toHaveTextContent(/blocked/i));
    fireEvent.click(screen.getByTestId('msg-block-toggle'));
    await waitFor(() => expect(api.unblockUser).toHaveBeenCalledWith(2));
  });

  it('reports a missing conversation', async () => {
    api.getThread.mockRejectedValue(new Error('Not found.'));
    render(<MessageThreadPage />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/not found/i));
  });

  it('loads older messages when a cursor exists', async () => {
    api.getMessages.mockResolvedValueOnce({
      next: 'http://api/api/v1/messages/threads/3/messages/?cursor=abc',
      previous: null,
      results: [message(11, 2, 'newest')],
    });
    api.getMessages.mockResolvedValueOnce({
      next: null,
      previous: null,
      results: [message(5, 2, 'older'), message(4, 1, 'oldest')].reverse(),
    });
    render(<MessageThreadPage />);
    fireEvent.click(await screen.findByText('Load older messages'));
    await waitFor(() => expect(api.getMessages).toHaveBeenCalledWith(3, { cursor: 'abc', pageSize: 30 }));
    await waitFor(() => expect(screen.getByText('oldest')).toBeInTheDocument());
  });
});
