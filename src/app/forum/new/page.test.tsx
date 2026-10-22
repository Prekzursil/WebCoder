import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { User } from '@/types';
import NewThreadPage from './page';

// New-thread form tests (frontend wiring wave): POST /forum/threads/ with
// {title, content, problem?}. The mock category/tags fields are gone; the
// optional problem dropdown is fed by the paginated problems catalog
// (collectAllPages). Auth-gated; validation stays client-side.

const api = vi.hoisted(() => ({
  getProblems: vi.fn(),
  createThread: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/services/ApiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/ApiService')>();
  return {
    ...actual,
    collectAllPages: async (fetchPage: (page: number) => Promise<{ results: unknown[] }>) => {
      const response = await fetchPage(1);
      return response.results;
    },
    ProblemService: { getProblems: api.getProblems },
    ForumService: { createThread: api.createThread },
  };
});

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 1, username: 'bob', email: 'b@x.com', role: 'BASIC_USER' } as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: api.push,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/forum/new',
  useParams: () => ({}),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.isAuthenticated = true;
  mocks.auth.user = { id: 1, username: 'bob', email: 'b@x.com', role: 'BASIC_USER' };
  api.getProblems.mockResolvedValue({ count: 2, next: null, previous: null, results: [] });
});

afterEach(cleanup);

describe('NewThreadPage (live create)', () => {
  it('requires login before showing the form', () => {
    mocks.auth.isAuthenticated = false;
    mocks.auth.user = null;
    render(<NewThreadPage />);
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByText('to start a thread.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post Thread' })).not.toBeInTheDocument();
  });

  it('keeps the submit disabled until title and content reach their minimums', async () => {
    render(<NewThreadPage />);
    await screen.findByLabelText(/Title/);

    const submit = screen.getByRole('button', { name: 'Post Thread' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Title/, { selector: '#thread-title' }), { target: { value: 'Short' } });
    expect(screen.getByText('Title must be at least 10 characters.')).toBeInTheDocument();
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Title/, { selector: '#thread-title' }), { target: { value: 'A valid thread title' } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Content/), { target: { value: 'x'.repeat(20) } });
    expect(submit).toBeEnabled();
  });

  it('submits title + content (+ optional problem link) and routes to the new thread', async () => {
    api.getProblems.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{ id: 5, title_i18n: { en: 'Merge Sort' }, difficulty: 'EASY', status: 'APPROVED' }],
    });
    api.createThread.mockResolvedValue({ id: 42, title: 'A valid thread title', problem: null, author: 'bob', post_count: 1, is_pinned: false, is_locked: false, last_activity: '', created_at: '' });
    render(<NewThreadPage />);

    await screen.findByText(/#5 — Merge Sort/);
    fireEvent.change(screen.getByLabelText(/Title/, { selector: '#thread-title' }), { target: { value: 'A valid thread title' } });
    fireEvent.change(screen.getByLabelText(/Content/), { target: { value: 'A sufficiently long body text.' } });
    fireEvent.change(screen.getByLabelText(/Linked problem/), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post Thread' }));

    await waitFor(() =>
      expect(api.createThread).toHaveBeenCalledWith({ title: 'A valid thread title', content: 'A sufficiently long body text.', problem: 5 })
    );
    await waitFor(() => expect(api.push).toHaveBeenCalledWith('/forum/42'));
  });

  it('keeps the form usable and shows the API error when creation fails', async () => {
    api.createThread.mockRejectedValue(new Error('Title already exists.'));
    render(<NewThreadPage />);

    await screen.findByLabelText(/Title/);
    fireEvent.change(screen.getByLabelText(/Title/, { selector: '#thread-title' }), { target: { value: 'A valid thread title' } });
    fireEvent.change(screen.getByLabelText(/Content/), { target: { value: 'A sufficiently long body text.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post Thread' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Title already exists.');
    // The form is still on screen — the user can edit and retry.
    expect(screen.getByRole('button', { name: 'Post Thread' })).toBeInTheDocument();
  });
});
