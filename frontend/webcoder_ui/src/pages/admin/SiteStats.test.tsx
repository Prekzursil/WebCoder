import React from 'react';
import { render, screen } from '@testing-library/react';
import SiteStatsPage from './SiteStats';
import { AdminService } from '../../services/ApiService';

jest.mock('../../services/ApiService', () => ({
  AdminService: { getStats: jest.fn() },
}));

const getStats = AdminService.getStats as jest.Mock;

describe('SiteStatsPage', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('shows the loading spinner before stats resolve', () => {
    getStats.mockReturnValue(new Promise(() => undefined));
    render(<SiteStatsPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders the three stat cards once data resolves', async () => {
    getStats.mockResolvedValue({
      data: { user_count: 5, problem_count: 7, submission_count: 9 },
    });
    render(<SiteStatsPage />);
    expect(await screen.findByText('Total Users')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('renders blank values when stats payload is missing (optional chaining)', async () => {
    getStats.mockResolvedValue({ data: undefined });
    render(<SiteStatsPage />);
    expect(await screen.findByText('Total Users')).toBeInTheDocument();
  });

  it('shows an error message when fetching stats fails', async () => {
    getStats.mockRejectedValue(new Error('boom'));
    render(<SiteStatsPage />);
    expect(await screen.findByText('Failed to fetch site statistics.')).toBeInTheDocument();
  });
});
