// [ANA-1 / Wave D] The owner-analytics panel: live funnel + retention,
// 30-day volume bars, weekly frozen trend; loading and error states.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import OwnerAnalytics from '@/app/admin/dashboard/OwnerAnalytics';
import * as ApiService from '@/services/ApiService';

const livePayload = {
  total_users: 42,
  users_with_submission: 25,
  users_with_ac: 18,
  activation_rate: 0.5952,
  first_ac_rate: 0.4286,
  d1_active: 14,
  d7_active: 19,
  d1_rate: 0.3333,
  d7_rate: 0.4524,
  submissions_per_day_30d: { '2026-10-27': 12, '2026-10-28': 7, '2026-10-29': 15 },
  total_submissions: 331,
};

const historyPayload = {
  weeks: 12,
  history: [
    {
      week: '2026-W42',
      captured_at: '2026-10-19T06:30:00Z',
      total_users: 30,
      users_with_submission: 17,
      users_with_ac: 11,
      d1_active: 8,
      d7_active: 12,
      total_submissions: 210,
    },
    {
      week: '2026-W43',
      captured_at: '2026-10-26T06:30:00Z',
      total_users: 42,
      users_with_submission: 25,
      users_with_ac: 18,
      d1_active: 14,
      d7_active: 19,
      total_submissions: 331,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(ApiService.AdminService, 'getActivation').mockResolvedValue(livePayload);
  vi.spyOn(ApiService.AdminService, 'getActivationHistory').mockResolvedValue(historyPayload);
});

afterEach(cleanup);

describe('OwnerAnalytics [ANA-1]', () => {
  it('renders the funnel + retention metrics from the live snapshot', async () => {
    render(<OwnerAnalytics />);
    // 42 also appears in the weekly trend row — assert presence, not
    // uniqueness, for the shared numbers.
    await waitFor(() =>
      expect(screen.getAllByText('42').length).toBeGreaterThan(0)
    );
    expect(screen.getAllByText('25').length).toBeGreaterThan(0);
    expect(screen.getAllByText('18').length).toBeGreaterThan(0);
    // Rates render as percentages.
    expect(screen.getByText('59.5%')).toBeInTheDocument();
    expect(screen.getByText('33.3%')).toBeInTheDocument();
    expect(screen.getByText('45.2%')).toBeInTheDocument();
  });

  it('renders one bar per active day in the 30-day strip', async () => {
    render(<OwnerAnalytics />);
    await waitFor(() =>
      expect(screen.getByTitle('2026-10-29: 15')).toBeInTheDocument()
    );
    expect(screen.getByTitle('2026-10-27: 12')).toBeInTheDocument();
    expect(screen.getByTitle('2026-10-28: 7')).toBeInTheDocument();
  });

  it('lists the weekly frozen trend rows', async () => {
    render(<OwnerAnalytics />);
    await waitFor(() => expect(screen.getByText('2026-W43')).toBeInTheDocument());
    expect(screen.getByText('2026-W42')).toBeInTheDocument();
  });

  it('shows the empty-snapshot hint when history is empty', async () => {
    vi.spyOn(ApiService.AdminService, 'getActivationHistory').mockResolvedValue({
      weeks: 12,
      history: [],
    });
    render(<OwnerAnalytics />);
    await waitFor(() =>
      expect(screen.getByText(/No weekly snapshots captured yet/i)).toBeInTheDocument()
    );
  });

  it('surfaces the API error instead of metrics', async () => {
    vi.spyOn(ApiService.AdminService, 'getActivation').mockRejectedValue(
      new Error('analytics down')
    );
    render(<OwnerAnalytics />);
    await waitFor(() => expect(screen.getByText('analytics down')).toBeInTheDocument());
    expect(screen.queryByText('42')).not.toBeInTheDocument();
  });

  it('notes the cookie-light derivation', async () => {
    render(<OwnerAnalytics />);
    await waitFor(() =>
      expect(screen.getByText(/no third-party trackers/i)).toBeInTheDocument()
    );
  });
});
