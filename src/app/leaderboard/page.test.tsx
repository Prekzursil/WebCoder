import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import type { User } from '@/types';
import LeaderboardPage from './page';

// Leaderboard page tests (frontend wiring wave): the page consumes the real
// standings endpoint (GET /leaderboard/, 50/page, window-ranked) and the
// optional GET /leaderboard/me/ card. The old MOCK_LEADERBOARD survives here
// only as fixture data. Covers: podium + table render, success_rate fraction
// -> percent, search, load-more following `next`, the me-card, and the
// error/retry state that keeps the page usable when the API fails.

const api = vi.hoisted(() => ({
  getLeaderboard: vi.fn(),
  getMyEntry: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  LeaderboardService: {
    getLeaderboard: api.getLeaderboard,
    getMyEntry: api.getMyEntry,
  },
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: false,
    token: null as string | null,
    refreshToken: null as string | null,
    user: null as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

const entry = (rank: number, username: string, total_points: number, solved: number, rate: number) => ({
  rank,
  username,
  solved_count: solved,
  total_points,
  success_rate: rate,
  last_solved_at: '2026-10-01T00:00:00Z',
});

const MOCK_LEADERBOARD = [
  entry(1, 'alex_coder', 4820, 142, 0.798),
  entry(2, 'mihai_dev', 4310, 128, 0.795),
  entry(3, 'ioana_pro', 3990, 119, 0.768),
  entry(4, 'stefan_algo', 3750, 111, 0.75),
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.isAuthenticated = false;
  mocks.auth.user = null;
  mocks.auth.token = null;
  api.getMyEntry.mockReset();
});

afterEach(cleanup);

describe('LeaderboardPage (live standings)', () => {
  it('renders the podium and the ranked table from GET /leaderboard/', async () => {
    api.getLeaderboard.mockResolvedValue({
      count: 4,
      next: null,
      previous: null,
      results: MOCK_LEADERBOARD,
    });
    render(<LeaderboardPage />);

    expect((await screen.findAllByText('alex_coder')).length).toBeGreaterThan(0);
    // Podium cards: top 3 usernames each appear twice (podium + table).
    expect(screen.getAllByText('mihai_dev')).toHaveLength(2);
    expect(screen.getAllByText('ioana_pro')).toHaveLength(2);
    // success_rate fraction renders as percent (0.798 -> 79.8%).
    expect(screen.getAllByText('79.8%').length).toBeGreaterThan(0);
    // Solved counts and points are shown.
    expect(screen.getAllByText('4,820').length).toBe(2); // podium + table
    // No Load more when next is null.
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    // No me-card for anonymous visitors.
    expect(screen.queryByText('Your rank')).not.toBeInTheDocument();
  });

  it('shows the authenticated user their own rank card via /leaderboard/me/', async () => {
    mocks.auth.isAuthenticated = true;
    mocks.auth.user = { id: 1, username: 'bob', email: 'b@x.com', role: 'BASIC_USER' };
    api.getLeaderboard.mockResolvedValue({ count: 4, next: null, previous: null, results: MOCK_LEADERBOARD });
    api.getMyEntry.mockResolvedValue({
      rank: 7,
      username: 'bob',
      solved_count: 3,
      total_points: 210,
      success_rate: 0.5,
      total_submissions: 6,
      ac_submissions: 3,
      last_solved_at: '2026-10-01T00:00:00Z',
    });
    render(<LeaderboardPage />);

    expect(await screen.findByText('Your rank')).toBeInTheDocument();
    expect(screen.getByText('#7')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument(); // total submissions
  });

  it('keeps the standings when the me-card request fails', async () => {
    mocks.auth.isAuthenticated = true;
    mocks.auth.user = { id: 1, username: 'bob', email: 'b@x.com', role: 'BASIC_USER' };
    api.getLeaderboard.mockResolvedValue({ count: 4, next: null, previous: null, results: MOCK_LEADERBOARD });
    api.getMyEntry.mockRejectedValue(new Error('Unauthorized'));
    render(<LeaderboardPage />);

    expect((await screen.findAllByText('alex_coder')).length).toBeGreaterThan(0);
    expect(screen.getByText('Your rank card is unavailable right now.')).toBeInTheDocument();
  });

  it('follows the next link when Load more is clicked', async () => {
    api.getLeaderboard
      .mockResolvedValueOnce({
        count: 5,
        next: 'http://localhost:8000/api/v1/leaderboard/?page=2',
        previous: null,
        results: MOCK_LEADERBOARD,
      })
      .mockResolvedValueOnce({
        count: 5,
        next: null,
        previous: null,
        results: [entry(5, 'radu_bits', 3480, 104, 0.743)],
      });
    render(<LeaderboardPage />);

    expect((await screen.findAllByText('alex_coder')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getByText('radu_bits')).toBeInTheDocument());
    expect(api.getLeaderboard).toHaveBeenLastCalledWith({ page: 2 });
    expect(screen.getByText(/Showing 5 of 5 ranked users/)).toBeInTheDocument();
  });

  it('searches the loaded rows by username', async () => {
    api.getLeaderboard.mockResolvedValue({ count: 4, next: null, previous: null, results: MOCK_LEADERBOARD });
    render(<LeaderboardPage />);
    await screen.findAllByText('alex_coder');

    fireEvent.change(screen.getByLabelText('Search by username'), { target: { value: 'stefan' } });
    // The podium stays the global top-3; the TABLE narrows to the match.
    const table = screen.getByRole('table');
    expect(within(table).getByText('stefan_algo')).toBeInTheDocument();
    expect(within(table).queryByText('alex_coder')).not.toBeInTheDocument();
  });

  it('renders the error card with a retry when the API fails', async () => {
    api.getLeaderboard.mockRejectedValue(new Error('Service unavailable'));
    render(<LeaderboardPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load leaderboard: Service unavailable');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    // Retry refetches and recovers.
    api.getLeaderboard.mockResolvedValue({ count: 1, next: null, previous: null, results: [MOCK_LEADERBOARD[0]] });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect((await screen.findAllByText('alex_coder')).length).toBeGreaterThan(0);
  });
});
