import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import IntegrityPanel from '@/app/admin/dashboard/IntegrityPanel';

// [Wave G items 113-118] the admin integrity panel.

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/ApiService', () => ({
  apiFetch: fetchMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // t(key, fallback?, vars?) — the component passes the fallback as the
    // 2nd arg and the vars as the 3rd.
    t: (key: string, a?: unknown, b?: unknown) => {
      const template = typeof a === 'string' ? a : key;
      const vars = (typeof a === 'object' && a) || (typeof b === 'object' && b) || {};
      return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
        String((vars as Record<string, unknown>)[name] ?? name),
      );
    },
  }),
}));

function mockAll() {
  fetchMock.mockImplementation((url: string, options?: RequestInit) => {
    if (url.includes('/integrity/flags/') && options?.method === 'POST') {
      return Promise.resolve({ id: 3, status: 'CONFIRMED' });
    }
    if (url.includes('/integrity/scan/')) {
      return Promise.resolve({ problem: 1, flags_created: { plagiarism: 1, boilerplate: 0 } });
    }
    if (url.includes('/integrity/appeals/') && options?.method === 'POST') {
      return Promise.resolve({ id: 9, status: 'ACCEPTED' });
    }
    if (url.includes('/integrity/flags/')) {
      return Promise.resolve([
        {
          id: 3,
          kind: 'PLAGIARISM',
          status: 'OPEN',
          score: 0.96,
          submission: { id: 51, user: 'bob', problem: 1 },
          other: { id: 52, user: 'carol' },
        },
      ]);
    }
    if (url.includes('/integrity/abuse-queue/')) {
      return Promise.resolve({
        items: [
          {
            kind: 'forum_report',
            id: 12,
            age_hours: 60.2,
            sla_due_in_hours: -12.2,
            sla_breached: true,
            reason: 'SPAM',
          },
          {
            kind: 'similarity_flag',
            id: 3,
            age_hours: 2.1,
            sla_due_in_hours: 45.9,
            sla_breached: false,
            reason: 'PLAGIARISM',
          },
        ],
        open_count: 2,
        sla_breached_count: 1,
        sla_hours: 48,
      });
    }
    if (url.includes('/integrity/multi-accounts/')) {
      return Promise.resolve({
        clusters: [
          {
            usernames: ['farm_a', 'farm_b'],
            shared_count: 2,
            shared_ips: ['10.0.0.1', '10.0.0.2'],
          },
        ],
      });
    }
    if (url.includes('/integrity/appeals/')) {
      return Promise.resolve([
        {
          id: 9,
          appellant: 'dave',
          action: 'CONTENT_HIDDEN',
          text: 'I believe this hide was wrong.',
        },
      ]);
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('IntegrityPanel [items 113-118]', () => {
  it('renders the abuse queue with SLA breach highlighting', async () => {
    mockAll();
    render(<IntegrityPanel />);
    const queue = await screen.findByTestId('integ-queue');
    expect(queue).toHaveTextContent('2 open');
    expect(queue).toHaveTextContent('breached');
  });

  it('scans a problem and reviews the flag', async () => {
    mockAll();
    render(<IntegrityPanel />);
    fireEvent.click(screen.getByTestId('integ-tab-flags'));
    const input = await screen.findByTestId('scan-problem-input');
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /scan/i }));
    expect(await screen.findByText('+1 plagiarism, +0 boilerplate')).toBeInTheDocument();
    expect(await screen.findByText(/bob/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/integrity/flags/3/review/',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('lists multi-account clusters', async () => {
    mockAll();
    render(<IntegrityPanel />);
    fireEvent.click(screen.getByTestId('integ-tab-accounts'));
    const panel = await screen.findByTestId('integ-accounts');
    expect(panel).toHaveTextContent('farm_a ↔ farm_b');
  });

  it('decides an appeal', async () => {
    mockAll();
    render(<IntegrityPanel />);
    fireEvent.click(screen.getByTestId('integ-tab-appeals'));
    const panel = await screen.findByTestId('integ-appeals');
    expect(panel).toHaveTextContent('dave');
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/integrity/appeals/9/decide/',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });
});
