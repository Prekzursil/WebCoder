import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import PublicRatingProfilePage, { chartPoints } from './page';

// RAT-1 profile rating graph tests: the public per-user rating profile
// consumes GET /ratings/ratings/users/{u}/ and renders the band-colored
// header, the SVG rating curve and the per-contest history table; unrated
// users get the honest empty state instead of a fabricated curve.

const api = vi.hoisted(() => ({
  getRatingHistory: vi.fn(),
  // Wave F items 52/53 — division profile + cohort percentiles.
  getUserDivisions: vi.fn().mockResolvedValue({ division: null, rated: false, changes: [] }),
  getPercentiles: vi.fn().mockResolvedValue({ rated: false }),
}));

vi.mock('@/services/ApiService', () => ({
  RatingService: api,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ username: 'glicko_guru' }),
}));

const RATED = {
  username: 'glicko_guru',
  rating: {
    rated: true,
    rating: 1742,
    internal_rating: 1842,
    rd: 44,
    contests_count: 3,
    band: { min: 1600, name_en: 'Expert', name_ro: 'Expert', color: '#aa00aa' },
  },
  history: [
    {
      contest: 1,
      contest_title: { en: 'Opening round', ro: 'Runda de deschidere' },
      end_at: '2026-10-01T12:00:00Z',
      rank: 4,
      rating: 1650,
      display_rating: 1250,
      delta: 150,
      rating_before: 1500,
    },
    {
      contest: 2,
      contest_title: { en: 'Second round', ro: 'Runda a doua' },
      end_at: '2026-10-08T12:00:00Z',
      rank: 2,
      rating: 1742,
      display_rating: 1542,
      delta: 92,
      rating_before: 1650,
    },
  ],
};

describe('chartPoints (RAT-1 curve math)', () => {
  it('returns null for an empty series', () => {
    expect(chartPoints([])).toBeNull();
  });

  it('maps a rising series to ascending x and descending y', () => {
    const chart = chartPoints([1200, 1400]);
    expect(chart).not.toBeNull();
    const [[x1, y1], [x2, y2]] = chart!.points.split(' ').map((p) => p.split(',').map(Number));
    expect(x2).toBeGreaterThan(x1);
    expect(y2).toBeLessThan(y1); // higher rating → smaller SVG y
    expect(chart!.min).toBe(1200);
    expect(chart!.max).toBe(1400);
  });

  it('centers a single point instead of dividing by zero', () => {
    const chart = chartPoints([1500]);
    expect(chart).not.toBeNull();
    // Centered horizontally, vertically mid-band (single value → 0.5 of span).
    const [[x, y]] = chart!.points.split(' ').map((p) => p.split(',').map(Number));
    expect(x).toBe(360); // pad + innerWidth / 2
    expect(y).toBe(120); // pad + innerHeight / 2
  });
});

describe('PublicRatingProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the band-colored header, chart and history table for a rated user', async () => {
    api.getRatingHistory.mockResolvedValue(RATED);

    render(<PublicRatingProfilePage />);

    await waitFor(() => {
      expect(screen.getByTestId('rating-profile-chart')).toBeInTheDocument();
    });
    expect(api.getRatingHistory).toHaveBeenCalledWith('glicko_guru');
    expect(screen.getByTestId('rating-profile-line')).toHaveAttribute(
      'points',
      expect.stringContaining(','),
    );
    // History rows link back to their contest.
    expect(screen.getByTestId('rating-history-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('rating-history-row-2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Second round' })).toHaveAttribute(
      'href',
      '/contests/2',
    );
    // Summary carries rating ± rd and the band name.
    expect(screen.getByTestId('rating-profile-summary').textContent).toContain('1742');
    expect(screen.getByTestId('rating-profile-summary').textContent).toContain('Expert');
  });

  it('renders the not-rated empty state without a chart', async () => {
    api.getRatingHistory.mockResolvedValue({
      username: 'newcomer',
      rating: {
        rated: false,
        rating: null,
        band: {
          min: 0,
          name_en: 'Newbie',
          name_ro: 'Începător',
          color: '#808080',
        },
      },
      history: [],
    });

    render(<PublicRatingProfilePage />);

    await waitFor(() => {
      expect(screen.getByTestId('rating-profile-empty')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('rating-profile-chart')).not.toBeInTheDocument();
    expect(screen.getByText('newcomer')).toBeInTheDocument();
  });

  it('surfaces load errors with a retry affordance', async () => {
    api.getRatingHistory.mockRejectedValueOnce(new Error('network down'));
    api.getRatingHistory.mockResolvedValueOnce(RATED);

    render(<PublicRatingProfilePage />);

    await waitFor(() => {
      expect(screen.getByTestId('rating-profile-error')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

describe('rating profile — divisions, percentiles, annotations (wave F)', () => {
  beforeEach(() => {
    api.getRatingHistory.mockReset().mockResolvedValue({
      ...RATED,
      annotations: {
        '0': { peak: 1250 },
        '1': { peak: 1542, medal: 'GOLD', division_change: 'promoted', division: 'Div 2' },
      },
      division: 'Div 2',
    });
    api.getUserDivisions.mockReset().mockResolvedValue({
      division: 'Div 2',
      rated: true,
      changes: [
        {
          contest: 2,
          title: 'Second round',
          from: 'Div 3',
          to: 'Div 2',
          kind: 'promoted',
          rating: 1542,
        },
      ],
    });
    api.getPercentiles.mockReset().mockResolvedValue({
      rated: true,
      display_rating: 1542,
      overall: { percentile: 90.0, total: 40 },
      school: { name: 'CNERV', percentile: 66.7, total: 3 },
      county: null,
    });
  });
  afterEach(() => cleanup());

  it('renders the division chip and the percentile line', async () => {
    render(<PublicRatingProfilePage />);
    expect(await screen.findByTestId('rating-profile-division')).toHaveTextContent('Div 2');
    const pct = await screen.findByTestId('rating-profile-percentiles');
    expect(pct.textContent).toContain('Top 10% overall');
    expect(pct.textContent).toContain('CNERV');
  });

  it('lists division promotions under the history table', async () => {
    render(<PublicRatingProfilePage />);
    const change = await screen.findByTestId('division-change-2');
    expect(change.textContent).toContain('Div 3');
    expect(change.textContent).toContain('Div 2');
  });

  it('annotates chart points (peaks, medals, division crossings)', async () => {
    render(<PublicRatingProfilePage />);
    await screen.findByTestId('rating-profile-chart');
    const svg = document.querySelector('svg');
    expect(svg).toBeTruthy();
    // The medal + promotion markers render as <text> nodes on the chart.
    const markers = Array.from(svg?.querySelectorAll('text') ?? []);
    const markerText = markers.map((node) => node.textContent ?? '').join(' ');
    expect(markerText).toContain('\u{1F947}');
    expect(markerText).toContain('\u21e7');
  });
});
