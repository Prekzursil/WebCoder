import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SiteStats from './SiteStats';
import { AdminService } from '@/services/ApiService';

vi.mock('@/services/ApiService', () => ({
  AdminService: { getUsers: vi.fn(), updateUser: vi.fn(), getStats: vi.fn() },
}));

const statsFixture = { user_count: 42, problem_count: 7, submission_count: 100 };

// vitest runs with globals: false, so @testing-library/react cannot register
// its auto-cleanup — without this, rendered bodies accumulate across tests.
afterEach(cleanup);

describe('SiteStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the loading spinner while stats are being fetched', () => {
    vi.mocked(AdminService.getStats).mockReturnValue(new Promise(() => {}));
    render(<SiteStats />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(AdminService.getStats).toHaveBeenCalledTimes(1);
  });

  it('renders the three counters after a successful fetch', async () => {
    vi.mocked(AdminService.getStats).mockResolvedValue(statsFixture);
    render(<SiteStats />);
    expect(await screen.findByText('Total Users')).toBeInTheDocument();
    expect(screen.getByText('Total Problems')).toBeInTheDocument();
    expect(screen.getByText('Total Submissions')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('renders the error message when the fetch fails', async () => {
    vi.mocked(AdminService.getStats).mockRejectedValue(new Error('network down'));
    render(<SiteStats />);
    expect(await screen.findByText('Failed to fetch site statistics.')).toBeInTheDocument();
  });
});
