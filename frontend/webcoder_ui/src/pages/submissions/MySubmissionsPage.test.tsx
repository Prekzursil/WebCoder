import React from 'react';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import MySubmissionsPage from './MySubmissionsPage';
import { renderWithProviders, seedAuthUser, makeUser } from '../../test-utils';
import { ProblemService, SubmissionService } from '../../services/ApiService';

jest.mock('../../services/ApiService', () => ({
  ProblemService: { getProblems: jest.fn() },
  SubmissionService: { getSubmissions: jest.fn() },
  AuthService: { getMe: jest.fn(() => new Promise(() => undefined)) },
}));

const getProblems = ProblemService.getProblems as jest.Mock;
const getSubmissions = SubmissionService.getSubmissions as jest.Mock;

const sub = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 1,
  problem: { id: 10, title_i18n: { en: 'Alpha' } },
  language: 'python3',
  verdict: 'AC',
  submission_time: '2024-01-01T10:00:00Z',
  score: 100,
  ...overrides,
});

describe('MySubmissionsPage', () => {
  beforeEach(() => {
    getProblems.mockReset().mockResolvedValue({ data: [{ id: 10, title_i18n: { en: 'Alpha' } }] });
    getSubmissions.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    seedAuthUser(makeUser({ id: 1 }));
  });
  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('prompts the user to login when not authenticated', () => {
    localStorage.clear();
    renderWithProviders(<MySubmissionsPage />);
    expect(screen.getByText(/Please login to view submissions/)).toBeInTheDocument();
  });

  it('shows a loading spinner while submissions load', () => {
    getSubmissions.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<MySubmissionsPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no submissions', async () => {
    getSubmissions.mockResolvedValue([]);
    renderWithProviders(<MySubmissionsPage />);
    expect(await screen.findByText('You have no submissions yet.')).toBeInTheDocument();
  });

  it('renders a submissions table with problem links and dash score', async () => {
    getSubmissions.mockResolvedValue([sub({ id: 5, score: null })]);
    renderWithProviders(<MySubmissionsPage />);
    expect(await screen.findByRole('link', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '5' })).toHaveAttribute('href', '/submissions/5');
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('shows an error message when fetching submissions fails', async () => {
    getSubmissions.mockRejectedValue(new Error('cannot fetch'));
    renderWithProviders(<MySubmissionsPage />);
    expect(await screen.findByText('cannot fetch')).toBeInTheDocument();
  });

  it('shows the default error message when the failure has no message', async () => {
    getSubmissions.mockRejectedValue({});
    renderWithProviders(<MySubmissionsPage />);
    expect(await screen.findByText('Failed to load submissions.')).toBeInTheDocument();
  });

  it('logs but tolerates a failure loading the problem filter list', async () => {
    getProblems.mockReset().mockRejectedValue(new Error('filter fail'));
    getSubmissions.mockResolvedValue([sub()]);
    renderWithProviders(<MySubmissionsPage />);
    await screen.findByRole('link', { name: 'Alpha' });
    expect(console.error).toHaveBeenCalledWith(
      'Failed to load problems for filter',
      expect.anything(),
    );
  });

  it('refetches with a problemId filter when a problem is selected', async () => {
    getSubmissions.mockResolvedValue([sub()]);
    renderWithProviders(<MySubmissionsPage />);
    await screen.findByRole('link', { name: 'Alpha' });
    fireEvent.change(screen.getByLabelText(/Filter by Problem/), { target: { value: '10' } });
    await waitFor(() => expect(getSubmissions).toHaveBeenLastCalledWith({ problemId: 10 }));
  });

  it('refetches with a language filter when text is entered', async () => {
    getSubmissions.mockResolvedValue([sub()]);
    renderWithProviders(<MySubmissionsPage />);
    await screen.findByRole('link', { name: 'Alpha' });
    fireEvent.change(screen.getByLabelText(/Filter by Language/), { target: { value: ' cpp17 ' } });
    await waitFor(() => expect(getSubmissions).toHaveBeenLastCalledWith({ language: 'cpp17' }));
  });

  it('sorts by score ascending, putting a null score first', async () => {
    getSubmissions.mockResolvedValue([
      sub({ id: 1, score: 50, problem: { id: 10, title_i18n: { en: 'Alpha' } } }),
      sub({ id: 2, score: null, problem: { id: 11, title_i18n: { en: 'Beta' } } }),
    ]);
    renderWithProviders(<MySubmissionsPage />);
    await screen.findByRole('link', { name: 'Alpha' });
    fireEvent.change(screen.getByLabelText(/Sort by/), { target: { value: 'score' } });
    fireEvent.change(screen.getByLabelText(/Order/), { target: { value: 'asc' } });
    const rows = screen.getAllByRole('row').slice(1); // drop header
    // null score (id 2) sorts before 50 (id 1) in ascending order
    expect(within(rows[0]).getByRole('link', { name: '2' })).toBeInTheDocument();
  });

  it('sorts by score ascending when the first row outranks the second', async () => {
    // first row score is null (-Infinity) only for valB; valA is a real number
    // and is greater, exercising the valA > valB / ascending => 1 path.
    getSubmissions.mockResolvedValue([sub({ id: 1, score: 90 }), sub({ id: 2, score: null })]);
    renderWithProviders(<MySubmissionsPage />);
    await screen.findByRole('link', { name: '1' });
    fireEvent.change(screen.getByLabelText(/Sort by/), { target: { value: 'score' } });
    fireEvent.change(screen.getByLabelText(/Order/), { target: { value: 'asc' } });
    const rows = screen.getAllByRole('row').slice(1);
    // null (-Infinity) comes first ascending; the 90-score row is last
    expect(within(rows[1]).getByRole('link', { name: '1' })).toBeInTheDocument();
  });

  it('sorts several scores ascending, exercising both comparison directions', async () => {
    getSubmissions.mockResolvedValue([
      sub({ id: 1, score: 30 }),
      sub({ id: 2, score: 10 }),
      sub({ id: 3, score: null }),
      sub({ id: 4, score: 20 }),
    ]);
    renderWithProviders(<MySubmissionsPage />);
    await screen.findByRole('link', { name: '1' });
    fireEvent.change(screen.getByLabelText(/Sort by/), { target: { value: 'score' } });
    fireEvent.change(screen.getByLabelText(/Order/), { target: { value: 'asc' } });
    const ids = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('link')[0].textContent);
    // ascending: null(-Inf), 10, 20, 30
    expect(ids).toEqual(['3', '2', '4', '1']);
  });

  it('sorts by language descending (string comparison)', async () => {
    getSubmissions.mockResolvedValue([
      sub({ id: 1, language: 'aaa' }),
      sub({ id: 2, language: 'zzz' }),
    ]);
    renderWithProviders(<MySubmissionsPage />);
    await screen.findByRole('link', { name: '1' });
    fireEvent.change(screen.getByLabelText(/Sort by/), { target: { value: 'language' } });
    fireEvent.change(screen.getByLabelText(/Order/), { target: { value: 'desc' } });
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByRole('link', { name: '2' })).toBeInTheDocument();
  });

  it('keeps equal sort values stable (no reordering)', async () => {
    getSubmissions.mockResolvedValue([
      sub({ id: 1, language: 'same' }),
      sub({ id: 2, language: 'same' }),
    ]);
    renderWithProviders(<MySubmissionsPage />);
    await screen.findByRole('link', { name: '1' });
    fireEvent.change(screen.getByLabelText(/Sort by/), { target: { value: 'language' } });
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByRole('link', { name: '1' })).toBeInTheDocument();
  });

  it('paginates and toggles the page when items per page is small', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      sub({ id: i + 1, problem: { id: 10, title_i18n: { en: 'Alpha' } } }),
    );
    getSubmissions.mockResolvedValue(many);
    renderWithProviders(<MySubmissionsPage />);
    await screen.findByText('My Submissions');
    // 12 items / 10 per page -> 2 pages
    const prev = screen.getByRole('button', { name: 'Previous' });
    const next = screen.getByRole('button', { name: 'Next' });
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();
    fireEvent.click(next);
    await waitFor(() => expect(prev).toBeEnabled());
    expect(next).toBeDisabled();
    fireEvent.click(prev);
    await waitFor(() => expect(prev).toBeDisabled());
  });

  it('ignores out-of-range page changes', async () => {
    const many = Array.from({ length: 12 }, (_, i) => sub({ id: i + 1 }));
    getSubmissions.mockResolvedValue(many);
    renderWithProviders(<MySubmissionsPage />);
    await screen.findByText('My Submissions');
    const prev = screen.getByRole('button', { name: 'Previous' });
    // already on page 1; clicking Previous (disabled) is a no-op guard path
    fireEvent.click(prev);
    expect(prev).toBeDisabled();
  });

  it('changes the items-per-page and resets to the first page', async () => {
    const many = Array.from({ length: 30 }, (_, i) => sub({ id: i + 1 }));
    getSubmissions.mockResolvedValue(many);
    renderWithProviders(<MySubmissionsPage />);
    await screen.findByText('My Submissions');
    fireEvent.change(screen.getByLabelText(/Items per page/), { target: { value: '25' } });
    // 30 items / 25 -> still 2 pages, but back on page 1
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('falls back to english title then problem id in the filter options and rows', async () => {
    getProblems.mockReset().mockResolvedValue({ data: [{ id: 99, title_i18n: {} }] });
    getSubmissions.mockResolvedValue([sub({ id: 1, problem: { id: 77, title_i18n: {} } })]);
    renderWithProviders(<MySubmissionsPage />);
    expect(await screen.findByRole('link', { name: 'ID: 77' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'ID: 99' })).toBeInTheDocument();
  });
});
