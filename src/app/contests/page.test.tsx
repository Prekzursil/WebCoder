import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import ContestsPage from './page';

// Contests index tests (Wave B CON-1/CON-10 UI): rows from
// GET /contests/ with state badges, rated/windowed chips, the ICS calendar
// link, state filter re-fetch, countdown to the next start, and the
// empty/error states.

const api = vi.hoisted(() => ({ getContests: vi.fn() }));

vi.mock('@/services/ApiService', () => ({
  ContestService: { getContests: api.getContests },
}));

const contest = (id: number, partial: Record<string, unknown> = {}) => ({
  id,
  title_i18n: { en: `Contest ${id}`, ro: `Concurs ${id}` },
  description_i18n: {},
  visibility: 'PUBLIC',
  is_rated: false,
  format: 'IOI',
  start_at: '2026-11-01T10:00:00Z',
  end_at: '2026-11-01T12:00:00Z',
  freeze_at: null,
  is_window: false,
  per_user_duration_minutes: 180,
  pretest_mode: false,
  created_by: 1,
  created_by_username: 'admin',
  state: 'FINISHED',
  problem_count: 3,
  participant_count: 12,
  ...partial,
});

const CONTESTS = [
  contest(1, { state: 'RUNNING', is_rated: true }),
  contest(2, { state: 'UPCOMING', is_window: true, start_at: '2999-01-01T00:00:00Z' }),
  contest(3),
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('ContestsPage', () => {
  it('renders contest rows with state/rated/windowed chips and dates', async () => {
    api.getContests.mockResolvedValue({ count: 3, next: null, previous: null, results: CONTESTS });
    render(<ContestsPage />);

    expect(await screen.findByText('Contest 1')).toBeInTheDocument();
    expect(screen.getByText('Contest 2')).toBeInTheDocument();
    expect(screen.getByTestId('contest-state-1')).toHaveTextContent('Running');
    expect(screen.getByTestId('contest-state-2')).toHaveTextContent('Upcoming');
    expect(screen.getByText('★ Rated')).toBeInTheDocument();
    expect(screen.getByText('⏱ Windowed')).toBeInTheDocument();
    // Row links to the detail page.
    expect(screen.getByRole('link', { name: 'Contest 1' })).toHaveAttribute('href', '/contests/1');
  });

  it('shows the ICS calendar feed link (CON-10)', async () => {
    api.getContests.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    render(<ContestsPage />);
    const link = await screen.findByTestId('contests-ics-link');
    expect(link).toHaveTextContent('Calendar');
    expect(link.getAttribute('href')).toContain('/api/v1/contests/calendar.ics');
  });

  it('counts down to the next upcoming contest', async () => {
    api.getContests.mockResolvedValue({ count: 1, next: null, previous: null, results: [contest(9, { state: 'UPCOMING', start_at: '2999-01-01T00:00:00Z' })] });
    render(<ContestsPage />);
    expect(await screen.findByTestId('next-contest-countdown')).toBeInTheDocument();
  });

  it('re-fetches with the state filter when a tab is pressed', async () => {
    api.getContests.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    render(<ContestsPage />);
    await waitFor(() => expect(api.getContests).toHaveBeenCalledWith({}, { page: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'Running' }));
    await waitFor(() =>
      expect(api.getContests).toHaveBeenCalledWith({ state: 'RUNNING' }, { page: 1 })
    );
  });

  it('renders the empty state and the error state with retry', async () => {
    api.getContests.mockRejectedValue(new Error('boom'));
    render(<ContestsPage />);
    expect(await screen.findByText('boom')).toBeInTheDocument();
    api.getContests.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No contests yet')).toBeInTheDocument();
  });
});
