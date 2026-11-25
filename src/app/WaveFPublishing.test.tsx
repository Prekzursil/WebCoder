import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import BlogsPage from '@/app/blogs/page';
import WaHelpPage from '@/app/wa-help/page';
import ActivityFeed from '@/components/common/ActivityFeed';
import type { User } from '@/types';

// Wave F items 62/64/65 — the blogs hub, the WA-help queue and the
// following-filtered activity feed.

const api = vi.hoisted(() => ({
  getBlogs: vi.fn(),
  createBlogPost: vi.fn(),
  deleteBlogPost: vi.fn(),
  getWaHelpQueue: vi.fn(),
  createWaHelpRequest: vi.fn(),
  answerWaHelp: vi.fn(),
  acceptWaHelp: vi.fn(),
  getFeed: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  // [wave G item 82/88] the palette/onboarding surfaces need these.
  SearchService: { federated: vi.fn().mockResolvedValue({ query: '', results: {} }) },
  OnboardingService: { get: vi.fn().mockResolvedValue({ steps: [], done: 0, total: 0 }) },
  CommunityService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 1, username: 'tester', email: 't@x.com', role: 'BASIC' } as User | null,
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

beforeEach(() => {
  api.getBlogs.mockReset();
  api.createBlogPost.mockReset();
  api.deleteBlogPost.mockReset();
  api.getWaHelpQueue.mockReset();
  api.createWaHelpRequest.mockReset();
  api.answerWaHelp.mockReset();
  api.acceptWaHelp.mockReset();
  api.getFeed.mockReset();
});

afterEach(() => cleanup());

describe('BlogsPage (item 62)', () => {
  it('lists published posts and filters by author', async () => {
    api.getBlogs.mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          author: 2,
          author_username: 'guru',
          title: 'How I cracked problem C',
          slug: 'how-i-cracked-problem-c',
          body: 'Long story…',
          lang: 'en',
          status: 'PUBLISHED',
          created_at: '2026-11-01T10:00:00Z',
          updated_at: '2026-11-01T10:00:00Z',
        },
      ],
    });
    render(<BlogsPage />);
    expect(await screen.findByTestId('blog-post-how-i-cracked-problem-c')).toBeTruthy();
    fireEvent.change(screen.getByTestId('blog-author-filter'), {
      target: { value: 'guru' },
    });
    await waitFor(() => expect(api.getBlogs).toHaveBeenLastCalledWith({ author: 'guru' }));
  });

  it('publishes a post through the editor', async () => {
    api.getBlogs.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    api.createBlogPost.mockResolvedValue({});
    render(<BlogsPage />);
    fireEvent.change(screen.getByTestId('blog-title-input'), {
      target: { value: 'My first post' },
    });
    fireEvent.change(screen.getByTestId('blog-body-input'), {
      target: { value: 'Hello world' },
    });
    fireEvent.click(screen.getByTestId('blog-submit'));
    await waitFor(() =>
      expect(api.createBlogPost).toHaveBeenCalledWith({
        title: 'My first post',
        body: 'Hello world',
        lang: 'en',
        status: 'PUBLISHED',
      }),
    );
  });

  it('authors can delete their own posts', async () => {
    api.getBlogs.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          author: 1,
          author_username: 'tester',
          title: 'Mine',
          slug: 'mine',
          body: 'b',
          lang: 'en',
          status: 'PUBLISHED',
          created_at: '2026-11-01T10:00:00Z',
          updated_at: '2026-11-01T10:00:00Z',
        },
      ],
    });
    api.deleteBlogPost.mockResolvedValue({});
    render(<BlogsPage />);
    await screen.findByTestId('blog-delete-mine');
    fireEvent.click(screen.getByTestId('blog-delete-mine'));
    await waitFor(() => expect(api.deleteBlogPost).toHaveBeenCalledWith('mine'));
  });
});

describe('WaHelpPage (item 64)', () => {
  it('renders the queue with answers and accept flow', async () => {
    api.getWaHelpQueue.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 7,
          submission: 42,
          asker: 1,
          asker_username: 'tester',
          problem_title: { en: 'Two Sum' },
          question: 'Why WA on test 4?',
          status: 'OPEN',
          answers: [
            {
              id: 9,
              author: 'helper',
              body: 'Sort the array.',
              is_accepted: false,
              created_at: '2026-11-02T10:00:00Z',
            },
          ],
          created_at: '2026-11-02T09:00:00Z',
        },
      ],
    });
    api.acceptWaHelp.mockResolvedValue({ detail: 'Accepted.' });
    render(<WaHelpPage />);
    const row = await screen.findByTestId('wa-help-row-7');
    expect(row.textContent).toContain('Why WA on test 4?');
    expect(screen.getByTestId('wa-help-answer-9').textContent).toContain('Sort the array.');
    fireEvent.click(screen.getByTestId('wa-help-accept-7'));
    await waitFor(() => expect(api.acceptWaHelp).toHaveBeenCalledWith(7, 9));
  });

  it('asks for help on a failed submission', async () => {
    api.getWaHelpQueue.mockResolvedValue({ count: 0, results: [] });
    api.createWaHelpRequest.mockResolvedValue({});
    render(<WaHelpPage />);
    fireEvent.change(screen.getByTestId('wa-help-submission-input'), {
      target: { value: '42' },
    });
    fireEvent.change(screen.getByTestId('wa-help-question-input'), {
      target: { value: 'TLE hint?' },
    });
    fireEvent.click(screen.getByTestId('wa-help-submit'));
    await waitFor(() => expect(api.createWaHelpRequest).toHaveBeenCalledWith(42, 'TLE hint?'));
  });

  it('answers an open request as a helper', async () => {
    mocks.auth.user = { id: 2, username: 'helper', email: 'h@x.com', role: 'BASIC' };
    api.getWaHelpQueue.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 8,
          submission: 50,
          asker: 1,
          asker_username: 'someone',
          problem_title: null,
          question: 'Why RE?',
          status: 'OPEN',
          answers: [],
          created_at: '2026-11-02T09:00:00Z',
        },
      ],
    });
    api.answerWaHelp.mockResolvedValue({ id: 11 });
    render(<WaHelpPage />);
    await screen.findByTestId('wa-help-row-8');
    fireEvent.change(screen.getByTestId('wa-help-answer-input-8'), {
      target: { value: 'Check array bounds.' },
    });
    fireEvent.click(screen.getByTestId('wa-help-answer-submit-8'));
    await waitFor(() => expect(api.answerWaHelp).toHaveBeenCalledWith(8, 'Check array bounds.'));
    mocks.auth.user = { id: 1, username: 'tester', email: 't@x.com', role: 'BASIC' };
  });
});

describe('ActivityFeed following toggle (item 65)', () => {
  it('toggles the following filter', async () => {
    api.getFeed.mockResolvedValue({ count: 1, results: [] });
    render(<ActivityFeed />);
    await screen.findByTestId('feed-following-toggle');
    fireEvent.click(screen.getByTestId('feed-following-toggle'));
    await waitFor(() => expect(api.getFeed).toHaveBeenLastCalledWith(1, true));
    fireEvent.click(screen.getByTestId('feed-following-toggle'));
    await waitFor(() => expect(api.getFeed).toHaveBeenLastCalledWith(1, false));
  });
});
