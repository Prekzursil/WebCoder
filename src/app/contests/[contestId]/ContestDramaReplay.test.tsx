import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import DramaPage from './drama/page';
import ReplayPage from './replay/[username]/page';

// Wave F items 57 + 58 — the frozen-board drama view and the per-user
// contest replay with its minute scrubber.

const api = vi.hoisted(() => ({
  getDrama: vi.fn(),
  getReplay: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  // [wave G item 82/88] the palette/onboarding surfaces need these.
  SearchService: { federated: vi.fn().mockResolvedValue({ query: '', results: {} }) },
  OnboardingService: { get: vi.fn().mockResolvedValue({ steps: [], done: 0, total: 0 }) },
  ContestService: api,
}));

const params = vi.hoisted(() => ({ current: {} as Record<string, string> }));

vi.mock('next/navigation', () => ({
  useParams: () => params.current,
}));

beforeEach(() => {
  api.getDrama.mockReset();
  api.getReplay.mockReset();
});

afterEach(() => cleanup());

describe('ContestDramaPage (item 58)', () => {
  it('shows frozen standings with hidden-submission counts', async () => {
    params.current = { contestId: '3' };
    api.getDrama.mockResolvedValue({
      is_frozen: true,
      freeze_at: '2026-11-01T10:00:00Z',
      reveal_at: '2026-11-01T11:00:00Z',
      seconds_until_reveal: 3599,
      results: [
        {
          rank: 1,
          user: { id: 1, username: 'alice' },
          score: 100,
          solved: 1,
          hidden_submissions: 0,
        },
        {
          rank: 2,
          user: { id: 2, username: 'bob' },
          score: 50,
          solved: 0,
          hidden_submissions: 3,
        },
      ],
    });
    render(<DramaPage />);
    const state = await screen.findByTestId('drama-state');
    expect(state.textContent).toContain('Frozen');
    const bobRow = screen.getByTestId('drama-row-bob');
    expect(bobRow.textContent).toContain('3');
    expect(screen.getByTestId('drama-row-alice').textContent).toContain('—');
  });

  it('handles the live (unfrozen) board', async () => {
    params.current = { contestId: '3' };
    api.getDrama.mockResolvedValue({
      is_frozen: false,
      freeze_at: null,
      reveal_at: '2026-11-01T11:00:00Z',
      seconds_until_reveal: 0,
      results: [],
    });
    render(<DramaPage />);
    expect(await screen.findByTestId('drama-state')).toBeTruthy();
    expect(screen.getByTestId('drama-state').textContent).toContain('live');
  });

  it('surfaces errors', async () => {
    params.current = { contestId: '3' };
    api.getDrama.mockRejectedValue(new Error('nope'));
    render(<DramaPage />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('nope');
  });
});

describe('ContestReplayPage (item 57)', () => {
  it('renders the timeline, rank and rating change', async () => {
    params.current = { contestId: '3', username: 'alice' };
    api.getReplay.mockResolvedValue({
      contest: 3,
      username: 'alice',
      is_virtual: false,
      final_rank: 2,
      rating_change: { delta: 20, rating: 1520 },
      events: [
        {
          minute_offset: 10,
          problem_label: 'A',
          problem_id: 1,
          verdict: 'WA',
          score: 10,
          problem_best: 10,
          problem_max: 100,
          total: 10,
          submission_id: 51,
        },
        {
          minute_offset: 40,
          problem_label: 'A',
          problem_id: 1,
          verdict: 'AC',
          score: 100,
          problem_best: 100,
          problem_max: 100,
          total: 100,
          submission_id: 52,
        },
      ],
    });
    render(<ReplayPage />);
    const summary = await screen.findByTestId('replay-summary');
    expect(summary.textContent).toContain('#2');
    expect(summary.textContent).toContain('+20');
    expect(screen.getByTestId('replay-event-51')).toBeTruthy();
    expect(screen.getByTestId('replay-event-52')).toBeTruthy();
    // Scrub to minute 0: only pre-scrub event rows stay fully visible and
    // the running total resets to the earliest visible state (0).
    fireEvent.change(screen.getByTestId('replay-scrubber'), { target: { value: '0' } });
    expect(screen.getByTestId('replay-running-total').textContent).toBe('0');
  });

  it('shows an empty state for silent participants', async () => {
    params.current = { contestId: '3', username: 'bob' };
    api.getReplay.mockResolvedValue({
      contest: 3,
      username: 'bob',
      is_virtual: false,
      final_rank: null,
      rating_change: null,
      events: [],
    });
    render(<ReplayPage />);
    const summary = await screen.findByTestId('replay-summary');
    expect(summary.textContent).toContain('No final rank');
  });
});
