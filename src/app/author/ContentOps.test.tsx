import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import AuthorAnalyticsPage from '@/app/author/analytics/page';
import SavedSearchesStrip from '@/app/problems/SavedSearchesStrip';
import type { User } from '@/types';

// Wave F items 129/131/132 — the analytics dashboard and the saved-search strip.

const api = vi.hoisted(() => ({
  getAuthorAnalytics: vi.fn(),
  getDrops: vi.fn(),
  listSavedSearches: vi.fn(),
  saveSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  // [wave G item 82/88] the palette/onboarding surfaces need these.
  SearchService: { federated: vi.fn().mockResolvedValue({ query: '', results: {} }) },
  OnboardingService: { get: vi.fn().mockResolvedValue({ steps: [], done: 0, total: 0 }) },
  ProblemService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 1, username: 'author', email: 'a@x.com', role: 'PROBLEM_CREATOR' } as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
  push: vi.fn(),
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  mocks.push.mockReset();
});

afterEach(() => cleanup());

describe('AuthorAnalyticsPage (items 131/132)', () => {
  it('renders the analytics summary + drop calendar', async () => {
    api.getAuthorAnalytics.mockResolvedValue({
      problems_total: 6,
      problems_approved: 4,
      by_difficulty: { EASY: 2, MEDIUM: 1, HARD: 1 },
      submissions_total: 120,
      acceptance_rate: 42.5,
      unique_solvers: 33,
      editorial_coverage: 3,
      open_test_bounties: 2,
    });
    api.getDrops.mockResolvedValue({
      count: 1,
      results: [{ problem_id: 9, title: 'Drop soon', publish_at: '2026-12-01T10:00:00Z' }],
    });
    render(<AuthorAnalyticsPage />);
    const summary = await screen.findByTestId('analytics-summary');
    expect(summary.textContent).toContain('4');
    expect(summary.textContent).toContain('42.5%');
    expect(summary.textContent).toContain('33');
    expect(screen.getByTestId('analytics-difficulty-HARD').textContent).toContain('1');
    expect(screen.getByTestId('drop-row-9').textContent).toContain('Drop soon');
  });

  it('empty drop calendar renders the honest empty state', async () => {
    api.getAuthorAnalytics.mockResolvedValue({
      problems_total: 0,
      problems_approved: 0,
      by_difficulty: {},
      submissions_total: 0,
      acceptance_rate: null,
      unique_solvers: 0,
      editorial_coverage: 0,
      open_test_bounties: 0,
    });
    api.getDrops.mockResolvedValue({ count: 0, results: [] });
    render(<AuthorAnalyticsPage />);
    await screen.findByTestId('drops-calendar');
    expect(screen.getByText(/Nothing scheduled/i)).toBeTruthy();
  });

  it('basic users get the creators-only note', () => {
    mocks.auth.user = { id: 2, username: 'b', email: 'b@x.com', role: 'BASIC_USER' } as User;
    render(<AuthorAnalyticsPage />);
    expect(screen.getByText(/creators and verifiers/i)).toBeTruthy();
    mocks.auth.user = {
      id: 1,
      username: 'author',
      email: 'a@x.com',
      role: 'PROBLEM_CREATOR',
    } as User;
  });
});

describe('SavedSearchesStrip (item 129)', () => {
  it('saves the current filter set, applies and deletes', async () => {
    api.listSavedSearches.mockResolvedValue({
      count: 1,
      results: [{ id: 7, name: 'Easy graphs', params: { difficulty: 'EASY' } }],
    });
    api.saveSavedSearch.mockResolvedValue({ id: 8, name: 'Mine', params: {} });
    api.deleteSavedSearch.mockResolvedValue({});
    render(<SavedSearchesStrip currentParams={{ difficulty: 'EASY', q: 'graph' }} />);
    await screen.findByTestId('saved-search-apply-7');
    fireEvent.change(screen.getByTestId('saved-search-name'), {
      target: { value: 'Mine' },
    });
    fireEvent.click(screen.getByTestId('saved-search-save'));
    await waitFor(() =>
      expect(api.saveSavedSearch).toHaveBeenCalledWith('Mine', {
        difficulty: 'EASY',
        q: 'graph',
      }),
    );
    fireEvent.click(screen.getByTestId('saved-search-apply-7'));
    expect(mocks.push).toHaveBeenCalledWith('/problems?difficulty=EASY');
    fireEvent.click(screen.getByTestId('saved-search-delete-7'));
    await waitFor(() => expect(api.deleteSavedSearch).toHaveBeenCalledWith(7));
  });

  it('hidden for anonymous callers', () => {
    mocks.auth.isAuthenticated = false;
    const { container } = render(<SavedSearchesStrip currentParams={{ difficulty: 'EASY' }} />);
    expect(container.textContent).toBe('');
    mocks.auth.isAuthenticated = true;
  });
});
