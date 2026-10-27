import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import RatingsPage from './page';
import type { User } from '@/types';

// Ratings ladder tests (Wave B RAT-1/3 UI): the public ladder with
// color-band handles, the caller's own rating card, and the empty state
// for a platform with no rated contests yet.

const api = vi.hoisted(() => ({ getLadder: vi.fn(), getMyRating: vi.fn() }));

vi.mock('@/services/ApiService', () => ({
  RatingService: api,
}));

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

const row = (id: number, username: string, rating: number, partial: Record<string, unknown> = {}) => ({
  user: { id, username },
  rating,
  internal_rating: rating,
  rd: 45,
  contests_count: 3,
  band: { min: 1200, name_en: 'Pupil', name_ro: 'Începător avansat', color: '#008000' },
  ...partial,
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('RatingsPage', () => {
  it('renders ladder rows with handle + rating and my-rating card', async () => {
    api.getLadder.mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [row(2, 'alice', 1905), row(3, 'carol', 1210)],
    });
    api.getMyRating.mockResolvedValue({
      rated: true,
      rating: 1520,
      internal_rating: 1560,
      rd: 40,
      contests_count: 2,
      band: { min: 1400, name_en: 'Specialist', name_ro: 'Specialist', color: '#0000ff' },
    });
    render(<RatingsPage />);

    expect(await screen.findByTestId('my-rating-card')).toHaveTextContent('bob');
    expect(await screen.findByTestId('rating-row-alice')).toHaveTextContent('1905');
    expect(screen.getByTestId('rating-row-carol')).toHaveTextContent('1210');
  });

  it('unrated callers see the unrated hint, not an error', async () => {
    api.getLadder.mockResolvedValue({ count: 1, next: null, previous: null, results: [row(2, 'alice', 1500)] });
    api.getMyRating.mockResolvedValue({
      rated: false,
      rating: null,
      band: { min: 0, name_en: 'Newbie', name_ro: 'Începător', color: '#808080' },
    });
    render(<RatingsPage />);

    expect(await screen.findByText(/Unrated — enter a rated contest/)).toBeInTheDocument();
  });

  it('empty ladder renders the honest empty state', async () => {
    api.getLadder.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    render(<RatingsPage />);
    expect(await screen.findByText('Nobody is rated yet')).toBeInTheDocument();
  });

  it('ladder fetch errors surface with retry', async () => {
    api.getLadder.mockRejectedValue(new Error('down'));
    render(<RatingsPage />);
    expect(await screen.findByText('down')).toBeInTheDocument();
  });
});
