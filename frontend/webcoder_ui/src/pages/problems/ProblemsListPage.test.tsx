import React from 'react';
import { screen } from '@testing-library/react';
import ProblemsListPage from './ProblemsListPage';
import { renderWithProviders } from '../../test-utils';
import { ProblemService } from '../../services/ApiService';

jest.mock('../../services/ApiService', () => ({
  ProblemService: { getProblems: jest.fn() },
}));

const getProblems = ProblemService.getProblems as jest.Mock;

describe('ProblemsListPage', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows the loading spinner before data resolves', () => {
    getProblems.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<ProblemsListPage />, { withAuth: false });
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders an empty-state message when no problems are returned', async () => {
    getProblems.mockResolvedValue({ data: [] });
    renderWithProviders(<ProblemsListPage />, { withAuth: false });
    expect(await screen.findByText('No problems available at the moment.')).toBeInTheDocument();
  });

  it('renders the localized title, difficulty and status for each problem', async () => {
    getProblems.mockResolvedValue({
      data: [
        {
          id: 1,
          title_i18n: { en: 'Two Sum' },
          difficulty: 'EASY',
          status: 'PUBLISHED',
        },
      ],
    });
    renderWithProviders(<ProblemsListPage />, { withAuth: false });
    const link = await screen.findByRole('link', { name: 'Two Sum' });
    expect(link).toHaveAttribute('href', '/problems/1');
    expect(screen.getByText(/EASY/)).toBeInTheDocument();
    expect(screen.getByText(/PUBLISHED/)).toBeInTheDocument();
  });

  it('falls back to the problem id when no title translation exists', async () => {
    getProblems.mockResolvedValue({
      data: [{ id: 42, title_i18n: {}, difficulty: 'HARD', status: 'DRAFT' }],
    });
    renderWithProviders(<ProblemsListPage />, { withAuth: false });
    expect(await screen.findByText('Problem ID: 42')).toBeInTheDocument();
  });

  it('shows an error message when fetching fails with a message', async () => {
    getProblems.mockRejectedValue(new Error('network down'));
    renderWithProviders(<ProblemsListPage />, { withAuth: false });
    expect(await screen.findByText('network down')).toBeInTheDocument();
  });

  it('shows the default error message when the failure has no message', async () => {
    getProblems.mockRejectedValue({});
    renderWithProviders(<ProblemsListPage />, { withAuth: false });
    expect(await screen.findByText('Failed to load problems.')).toBeInTheDocument();
  });
});
