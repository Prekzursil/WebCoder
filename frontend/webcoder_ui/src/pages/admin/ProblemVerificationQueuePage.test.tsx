import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import ProblemVerificationQueuePage from './ProblemVerificationQueuePage';
import { renderWithProviders, seedAuthUser, makeUser } from '../../test-utils';
import { ProblemService } from '../../services/ApiService';

jest.mock('../../services/ApiService', () => ({
  ProblemService: {
    getProblems: jest.fn(),
    approveProblem: jest.fn(),
    rejectProblem: jest.fn(),
  },
  AuthService: { getMe: jest.fn(() => new Promise(() => undefined)) },
}));

const getProblems = ProblemService.getProblems as jest.Mock;
const approveProblem = ProblemService.approveProblem as jest.Mock;
const rejectProblem = ProblemService.rejectProblem as jest.Mock;

const pending = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 1,
  title_i18n: { en: 'Pending One' },
  difficulty: 'MEDIUM',
  status: 'PENDING_APPROVAL',
  author: { id: 9, username: 'author1' },
  ...overrides,
});

describe('ProblemVerificationQueuePage', () => {
  beforeEach(() => {
    getProblems.mockReset();
    approveProblem.mockReset();
    rejectProblem.mockReset();
    seedAuthUser(makeUser({ id: 1, role: 'PROBLEM_VERIFIER' }));
  });
  afterEach(() => localStorage.clear());

  it('shows the loading spinner first', () => {
    getProblems.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<ProblemVerificationQueuePage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows an empty state when no problems are pending', async () => {
    getProblems.mockResolvedValue({ data: [] });
    renderWithProviders(<ProblemVerificationQueuePage />);
    expect(
      await screen.findByText('No problems are currently pending approval.'),
    ).toBeInTheDocument();
  });

  it('renders a pending problem with its author and edit link', async () => {
    getProblems.mockResolvedValue({ data: [pending()] });
    renderWithProviders(<ProblemVerificationQueuePage />);
    const link = await screen.findByRole('link', { name: 'Pending One' });
    expect(link).toHaveAttribute('href', '/problems/1/edit');
    expect(screen.getByText('author1')).toBeInTheDocument();
  });

  it('falls back to "Unknown" when the problem has no author', async () => {
    getProblems.mockResolvedValue({ data: [pending({ author: undefined })] });
    renderWithProviders(<ProblemVerificationQueuePage />);
    expect(await screen.findByText('Unknown')).toBeInTheDocument();
  });

  it('shows an error when loading fails with a message', async () => {
    getProblems.mockRejectedValue(new Error('cannot load'));
    renderWithProviders(<ProblemVerificationQueuePage />);
    expect(await screen.findByText('cannot load')).toBeInTheDocument();
  });

  it('shows the default error when loading fails without a message', async () => {
    getProblems.mockRejectedValue({});
    renderWithProviders(<ProblemVerificationQueuePage />);
    expect(await screen.findByText('Failed to load pending problems.')).toBeInTheDocument();
  });

  it('shows an auth-required error when not authenticated', async () => {
    localStorage.clear();
    renderWithProviders(<ProblemVerificationQueuePage />);
    expect(await screen.findByText('Authentication required.')).toBeInTheDocument();
  });

  it('shows an unauthorized message for a non-verifier role', async () => {
    seedAuthUser(makeUser({ id: 1, role: 'BASIC_USER' }));
    getProblems.mockResolvedValue({ data: [] });
    renderWithProviders(<ProblemVerificationQueuePage />);
    expect(
      await screen.findByText('You are not authorized to view this page.'),
    ).toBeInTheDocument();
  });

  it('approves a problem (without feedback) and shows a success message', async () => {
    getProblems.mockResolvedValue({ data: [pending()] });
    approveProblem.mockResolvedValue({});
    renderWithProviders(<ProblemVerificationQueuePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Problem approved successfully!')).toBeInTheDocument();
    expect(approveProblem).toHaveBeenCalledWith(1, { feedback: undefined });
  });

  it('approves a problem with feedback typed in', async () => {
    getProblems.mockResolvedValue({ data: [pending()] });
    approveProblem.mockResolvedValue({});
    renderWithProviders(<ProblemVerificationQueuePage />);
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'looks good' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(approveProblem).toHaveBeenCalledWith(1, { feedback: 'looks good' }),
    );
  });

  it('shows an error when approval fails', async () => {
    getProblems.mockResolvedValue({ data: [pending()] });
    approveProblem.mockRejectedValue(new Error('approve failed'));
    renderWithProviders(<ProblemVerificationQueuePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('approve failed')).toBeInTheDocument();
  });

  it('shows the default approval error when none is given', async () => {
    getProblems.mockResolvedValue({ data: [pending()] });
    approveProblem.mockRejectedValue({});
    renderWithProviders(<ProblemVerificationQueuePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Failed to approve problem.')).toBeInTheDocument();
  });

  it('requires feedback before a problem can be rejected', async () => {
    getProblems.mockResolvedValue({ data: [pending()] });
    renderWithProviders(<ProblemVerificationQueuePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Feedback is required for rejection.')).toBeInTheDocument();
    expect(rejectProblem).not.toHaveBeenCalled();
  });

  it('rejects a problem with feedback and shows a success message', async () => {
    getProblems.mockResolvedValue({ data: [pending()] });
    rejectProblem.mockResolvedValue({});
    renderWithProviders(<ProblemVerificationQueuePage />);
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'too easy' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Problem rejected successfully!')).toBeInTheDocument();
    expect(rejectProblem).toHaveBeenCalledWith(1, { feedback: 'too easy' });
  });

  it('shows an error when rejection fails', async () => {
    getProblems.mockResolvedValue({ data: [pending()] });
    rejectProblem.mockRejectedValue(new Error('reject failed'));
    renderWithProviders(<ProblemVerificationQueuePage />);
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'no' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('reject failed')).toBeInTheDocument();
  });

  it('shows the default rejection error when none is given', async () => {
    getProblems.mockResolvedValue({ data: [pending()] });
    rejectProblem.mockRejectedValue({});
    renderWithProviders(<ProblemVerificationQueuePage />);
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'no' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Failed to reject problem.')).toBeInTheDocument();
  });
});
