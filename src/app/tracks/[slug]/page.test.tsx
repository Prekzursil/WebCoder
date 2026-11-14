import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import TrackDetailPage from './page';

// X12 — one study track: ordered items, Continue CTA to the first unsolved
// problem, solved checks, and owner add/move/remove controls.

const api = vi.hoisted(() => ({
  get: vi.fn(),
  addProblem: vi.fn(),
  removeProblem: vi.fn(),
  moveProblem: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  TrackService: api,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'beginner-ladder' }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

const DETAIL = (overrides: Record<string, unknown> = {}) => ({
  slug: 'beginner-ladder',
  title_i18n: { en: 'Beginner ladder', ro: 'Scara' },
  description_i18n: { en: 'Start here.', ro: '' },
  owner_username: 'creator',
  is_public: true,
  is_owner: false,
  item_count: 2,
  solved_count: 1,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  items: [
    {
      problem_id: 1,
      title_i18n: { en: 'A Plus B', ro: 'A Plus B' },
      difficulty: 'VERY_EASY',
      position: 1,
      is_solved: true,
    },
    {
      problem_id: 2,
      title_i18n: { en: 'Two Sum', ro: 'Two Sum' },
      difficulty: 'EASY',
      position: 2,
      is_solved: false,
    },
  ],
  ...overrides,
});

describe('TrackDetailPage', () => {
  it('renders ordered problems with solved checks and a Continue CTA', async () => {
    api.get.mockResolvedValue(DETAIL());
    render(<TrackDetailPage />);

    expect(await screen.findByText('Beginner ladder')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'A Plus B' })).toHaveAttribute('href', '/problems/1');
    expect(screen.getByTestId('track-solved-1')).toBeInTheDocument();
    expect(screen.queryByTestId('track-solved-2')).not.toBeInTheDocument();
    expect(screen.getByText(/1\/2 solved/)).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /continue/i });
    expect(cta).toHaveAttribute('href', '/problems/2');
    // Non-owners get no curator controls.
    expect(screen.queryByLabelText(/remove from track/i)).not.toBeInTheDocument();
  });

  it('celebrates a completed track instead of a Continue CTA', async () => {
    api.get.mockResolvedValue(
      DETAIL({
        items: DETAIL().items.map((item) => ({ ...item, is_solved: true })),
      }),
    );
    render(<TrackDetailPage />);

    expect(await screen.findByTestId('track-complete')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /continue/i })).not.toBeInTheDocument();
  });

  it('surfaces a not-found error', async () => {
    api.get.mockRejectedValue(new Error('404'));
    render(<TrackDetailPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/back to tracks/i)).toBeInTheDocument();
  });

  it('lets the owner add, move and remove problems', async () => {
    const detail = DETAIL({ is_owner: true });
    api.get.mockResolvedValue(detail);
    api.addProblem.mockResolvedValue(detail);
    api.moveProblem.mockResolvedValue(detail);
    api.removeProblem.mockResolvedValue(detail);
    render(<TrackDetailPage />);

    await screen.findByText('Beginner ladder');
    const input = screen.getByLabelText(/add problem by id/i);
    fireEvent.change(input, { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await waitFor(() => expect(api.addProblem).toHaveBeenCalledWith('beginner-ladder', 42));

    fireEvent.click(screen.getAllByLabelText(/move up/i)[0]);
    await waitFor(() => expect(api.moveProblem).toHaveBeenCalledWith('beginner-ladder', 1, 'up'));

    fireEvent.click(screen.getAllByLabelText(/remove from track/i)[0]);
    await waitFor(() => expect(api.removeProblem).toHaveBeenCalledWith('beginner-ladder', 1));
  });

  it('rejects a non-numeric problem id before calling the API', async () => {
    api.get.mockResolvedValue(DETAIL({ is_owner: true }));
    render(<TrackDetailPage />);

    await screen.findByText('Beginner ladder');
    fireEvent.change(screen.getByLabelText(/add problem by id/i), {
      target: { value: 'abc' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/number/i);
    expect(api.addProblem).not.toHaveBeenCalled();
  });

  it('shows an action error when a mutation fails', async () => {
    const detail = DETAIL({ is_owner: true });
    api.get.mockResolvedValue(detail);
    api.addProblem.mockRejectedValue(new Error('duplicate'));
    render(<TrackDetailPage />);

    await screen.findByText('Beginner ladder');
    fireEvent.change(screen.getByLabelText(/add problem by id/i), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('duplicate');
  });
});
