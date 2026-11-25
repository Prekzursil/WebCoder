import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import OpsPanel from '@/app/admin/dashboard/OpsPanel';

// [wave G items 136/143/145] the admin operator panel.

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/ApiService', () => ({
  apiFetch: fetchMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // t(key, fallback?, vars?) — support both 2- and 3-arg forms.
    t: (key: string, a?: unknown, b?: unknown) => {
      let template = typeof a === 'string' ? a : key;
      const vars = (typeof a === 'object' && a) || (typeof b === 'object' && b) || {};
      if (key === 'ops_errors_total') {
        template = typeof a === 'string' ? a : key;
      }
      return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
        String((vars as Record<string, unknown>)[name] ?? name),
      );
    },
  }),
}));

function mockAll() {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/ops/errors/')) {
      return Promise.resolve({
        window_hours: 24,
        total: 4,
        grouped: [
          { digest: 'd1', path: '/api/v1/x/', method: 'POST', status_code: 500, count: 3 },
          { digest: 'd2', path: '/api/v1/y/', method: 'GET', status_code: 503, count: 1 },
        ],
        events: [],
      });
    }
    if (url.includes('/ops/costs/')) {
      return Promise.resolve({
        currency: 'EUR',
        period: 'month',
        lines: {
          vm_worker: { formula: '1 × 12.0', eur: 12.0 },
          storage: { formula: '0.5 GB × 0.1', eur: 0.05 },
        },
        total: 12.05,
      });
    }
    if (url.includes('/ops/autoscale/')) {
      return Promise.resolve({
        current_workers: 1,
        recommended_workers: 3,
        direction: 'up',
        queue_depth: 12,
      });
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

function mockEmpty() {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/ops/errors/')) {
      return Promise.resolve({ window_hours: 24, total: 0, grouped: [], events: [] });
    }
    if (url.includes('/ops/costs/')) {
      return Promise.resolve({
        currency: 'EUR',
        period: 'month',
        lines: {},
        total: 0,
      });
    }
    if (url.includes('/ops/autoscale/')) {
      return Promise.resolve({
        current_workers: 2,
        recommended_workers: 2,
        direction: 'hold',
        queue_depth: 0,
      });
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('OpsPanel [items 136/143/145]', () => {
  it('renders the autoscale recommendation', async () => {
    mockAll();
    render(<OpsPanel />);
    const panel = await screen.findByTestId('ops-autoscale');
    expect(panel).toHaveTextContent('1 → 3');
    expect(panel).toHaveTextContent('scale up');
    expect(panel).toHaveTextContent('12');
  });

  it('renders the cost table with the auditable total', async () => {
    mockAll();
    render(<OpsPanel />);
    const costs = await screen.findByTestId('ops-costs');
    expect(costs).toHaveTextContent('1 × 12.0');
    expect(screen.getByTestId('ops-cost-total')).toHaveTextContent('12.05');
  });

  it('lists grouped server errors', async () => {
    mockAll();
    render(<OpsPanel />);
    const errors = await screen.findByTestId('ops-errors');
    expect(errors).toHaveTextContent('/api/v1/x/');
    expect(errors).toHaveTextContent('500');
  });

  it('shows the empty state when no errors were recorded', async () => {
    mockEmpty();
    render(<OpsPanel />);
    expect(await screen.findByTestId('ops-errors-empty')).toBeInTheDocument();
  });

  it('degrades when the admin endpoints reject', async () => {
    fetchMock.mockRejectedValue(new Error('403'));
    render(<OpsPanel />);
    // Unavailable is NOT "no errors" — an unreachable stream must not
    // claim a clean slate during an outage.
    await waitFor(() => expect(screen.getByText(/Error stream unavailable/i)).toBeInTheDocument());
    expect(screen.getByText(/Recommendation unavailable/i)).toBeInTheDocument();
  });
});
