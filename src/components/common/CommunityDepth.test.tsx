import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ActivityFeed from './ActivityFeed';
import WeeklyBoard from './WeeklyBoard';
import SolutionsPanel from '@/app/problems/[problemId]/SolutionsPanel';

// Wave C community depth: COM-3 feed, COM-7 solutions, RAT-9 weekly board.

const api = vi.hoisted(() => ({
  getFeed: vi.fn(),
  getSolutions: vi.fn(),
  getWeeklyBoard: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  CommunityService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 2, username: 'bob', email: 'b@x.com', role: 'BASIC' },
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
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('ActivityFeed (COM-3)', () => {
  it('renders verdict rows with problem links and no code', async () => {
    api.getFeed.mockResolvedValue({
      count: 1,
      page: 1,
      next: null,
      results: [
        {
          id: 9,
          user: 'alice',
          problem: { id: 1, title_i18n: { en: 'Two Sum', ro: 'Suma a două' } },
          language: 'python3',
          verdict: 'AC',
          score: 100,
          submission_time: '2026-11-01T00:00:00Z',
        },
      ],
    });
    render(<ActivityFeed />);

    const row = await screen.findByTestId('feed-row-9');
    expect(row).toHaveTextContent('alice');
    expect(row).toHaveTextContent('Two Sum');
    expect(row).toHaveTextContent('AC');
    expect(screen.queryByText(/pass/)).not.toBeInTheDocument();
  });

  it('shows the empty state quietly', async () => {
    api.getFeed.mockResolvedValue({ count: 0, page: 1, next: null, results: [] });
    render(<ActivityFeed />);
    expect(await screen.findByText(/No public activity yet/i)).toBeInTheDocument();
  });
});

describe('SolutionsPanel (COM-7)', () => {
  it('renders the locked reason when the backend gates access', async () => {
    api.getSolutions.mockRejectedValue(
      new Error('Solve the problem first to browse community solutions.')
    );
    render(<SolutionsPanel problemId={1} />);

    expect(await screen.findByTestId('solutions-locked')).toHaveTextContent(
      /Solve the problem first/
    );
  });

  it('lists solutions with the license note and reveals code', async () => {
    api.getSolutions.mockResolvedValue({
      count: 1,
      license: "Code stays the author's; the platform displays it under the Terms.",
      results: [
        {
          id: 5,
          user: 'alice',
          language: 'python3',
          code: 'print(2)',
          execution_time_ms: 12,
          memory_used_kb: 2048,
          submission_time: '2026-11-01T00:00:00Z',
        },
      ],
    });
    render(<SolutionsPanel problemId={1} />);

    fireEvent.click(await screen.findByTestId('solution-toggle-5'));
    expect(await screen.findByTestId('solution-code-5')).toHaveTextContent('print(2)');
    expect(screen.getByText(/platform displays it/i)).toBeInTheDocument();
  });

  it('stays out of the anonymous DOM', () => {
    mocks.auth.isAuthenticated = false;
    const { container } = render(<SolutionsPanel problemId={1} />);
    expect(container.querySelector('[data-testid="solutions-panel"]')).toBeNull();
    mocks.auth.isAuthenticated = true;
  });
});

describe('WeeklyBoard (RAT-9)', () => {
  it('ranks the rolling week', async () => {
    api.getWeeklyBoard.mockResolvedValue({
      count: 1,
      window_days: 7,
      results: [
        { rank: 1, user_id: 2, username: 'alice', solved: 3, points: 300 },
      ],
    });
    render(<WeeklyBoard />);

    const row = await screen.findByTestId('weekly-row-alice');
    expect(row).toHaveTextContent('3');
    expect(row).toHaveTextContent('300');
    expect(screen.getByText(/Rolling 7-day/i)).toBeInTheDocument();
  });

  it('surfaces failures without crashing', async () => {
    api.getWeeklyBoard.mockRejectedValue(new Error('boom'));
    render(<WeeklyBoard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });
});
