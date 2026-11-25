import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import AnalyticsPanels from '@/app/admin/dashboard/AnalyticsPanels';

// [Wave G items 105/110/111/112] the admin analytics tabs.

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/ApiService', () => ({
  // [wave G item 82/88] the palette/onboarding surfaces need these.
  SearchService: { federated: vi.fn().mockResolvedValue({ query: '', results: {} }) },
  OnboardingService: { get: vi.fn().mockResolvedValue({ steps: [], done: 0, total: 0 }) },
  apiFetch: fetchMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrVars?: unknown) => {
      if (typeof fallbackOrVars === 'string') return fallbackOrVars;
      return key;
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

function mockAll() {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/analytics/funnel/')) {
      return Promise.resolve({
        steps: [
          { key: 'signup', count: 100, rate: 1 },
          { key: 'first_submission', count: 60, rate: 0.6 },
        ],
      });
    }
    if (url.includes('/analytics/search/')) {
      return Promise.resolve({
        total_searches: 8,
        top_queries: [{ query: 'sum', n: 5 }],
        zero_result_queries: [{ query: 'segment tree', n: 3 }],
      });
    }
    if (url.includes('/analytics/season-reports/')) {
      return Promise.resolve([{ season: '2026Q4', generated_at: '2026-11-19T00:00:00Z' }]);
    }
    if (url.includes('/analytics/org/')) {
      return Promise.resolve({
        school: 'CNIT',
        county: '',
        members: 12,
        weekly_active_solvers: 7,
        total_solves: 40,
        submissions_30d: 120,
      });
    }
    return Promise.reject(new Error('unexpected url'));
  });
}

describe('AnalyticsPanels [items 105/110/111/112]', () => {
  it('renders the funnel bars on load', async () => {
    mockAll();
    render(<AnalyticsPanels />);
    const funnel = await screen.findByTestId('analytics-funnel');
    expect(funnel).toHaveTextContent('signup — 100');
    expect(funnel).toHaveTextContent('first_submission — 60');
  });

  it('looks up a school segment', async () => {
    mockAll();
    render(<AnalyticsPanels />);
    fireEvent.click(screen.getByTestId('analytics-tab-org'));
    const input = await screen.findByTestId('org-school-input');
    fireEvent.change(input, { target: { value: 'CNIT' } });
    fireEvent.click(screen.getByRole('button', { name: /look up/i }));
    await waitFor(() => expect(screen.getByTestId('analytics-org')).toHaveTextContent('12'));
  });

  it('shows search analytics with zero-result content gaps', async () => {
    mockAll();
    render(<AnalyticsPanels />);
    fireEvent.click(screen.getByTestId('analytics-tab-search'));
    const panel = await screen.findByTestId('analytics-search');
    expect(panel).toHaveTextContent('sum × 5');
    expect(panel).toHaveTextContent('segment tree × 3');
  });

  it('generates and displays a season report', async () => {
    mockAll();
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/analytics/season-reports/') && options?.method === 'POST') {
        return Promise.resolve({
          season: '2026Q4',
          markdown: '# WebCoder 2026Q4 report\n\n- New accounts: **10**',
        });
      }
      if (url.includes('/analytics/season-reports/')) {
        return Promise.resolve([{ season: '2026Q4', generated_at: 'x' }]);
      }
      return Promise.resolve({ steps: [], top_queries: [], zero_result_queries: [] });
    });
    render(<AnalyticsPanels />);
    fireEvent.click(screen.getByTestId('analytics-tab-season'));
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    const body = await screen.findByTestId('season-body');
    expect(body).toHaveTextContent('2026Q4 report');
  });

  it('surfaces a failed org lookup', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/analytics/funnel/')) return Promise.resolve({ steps: [] });
      if (url.includes('/analytics/search/'))
        return Promise.resolve({ total_searches: 0, top_queries: [], zero_result_queries: [] });
      if (url.includes('/analytics/season-reports/')) return Promise.resolve([]);
      return Promise.reject(new Error('404'));
    });
    render(<AnalyticsPanels />);
    fireEvent.click(screen.getByTestId('analytics-tab-org'));
    fireEvent.change(await screen.findByTestId('org-school-input'), {
      target: { value: 'Nopes' },
    });
    fireEvent.click(screen.getByRole('button', { name: /look up/i }));
    await screen.findByText(/no segment found/i);
  });
});
