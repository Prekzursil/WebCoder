import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import toast from 'react-hot-toast';
import MyCreatedProblemsPage from './MyCreatedProblemsPage';
import { renderWithProviders, seedAuthUser, makeUser } from '../../test-utils';
import { ProblemService } from '../../services/ApiService';

jest.mock('../../services/ApiService', () => ({
  ProblemService: { getProblems: jest.fn(), submitForApproval: jest.fn() },
  AuthService: { getMe: jest.fn(() => new Promise(() => undefined)) },
}));
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

const getProblems = ProblemService.getProblems as jest.Mock;
const submitForApproval = ProblemService.submitForApproval as jest.Mock;
const toastSuccess = (toast as unknown as { success: jest.Mock }).success;
const toastError = (toast as unknown as { error: jest.Mock }).error;

const problem = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 1,
  title_i18n: { en: 'My Problem' },
  difficulty: 'EASY',
  status: 'DRAFT',
  ...overrides,
});

describe('MyCreatedProblemsPage', () => {
  beforeEach(() => {
    getProblems.mockReset();
    submitForApproval.mockReset();
    toastSuccess.mockClear();
    toastError.mockClear();
    seedAuthUser(makeUser({ id: 5, role: 'PROBLEM_CREATOR' }));
  });
  afterEach(() => localStorage.clear());

  it('shows the loading spinner first', () => {
    getProblems.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<MyCreatedProblemsPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders an empty state when the author has no problems', async () => {
    getProblems.mockResolvedValue({ data: [] });
    renderWithProviders(<MyCreatedProblemsPage />);
    expect(
      await screen.findByText('You have not created any problems yet.'),
    ).toBeInTheDocument();
  });

  it('renders a DRAFT problem with edit link and submit button', async () => {
    getProblems.mockResolvedValue({ data: [problem({ status: 'DRAFT' })] });
    renderWithProviders(<MyCreatedProblemsPage />);
    const link = await screen.findByRole('link', { name: 'My Problem' });
    expect(link).toHaveAttribute('href', '/problems/1');
    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for Approval' })).toBeInTheDocument();
  });

  it('renders a PRIVATE problem with edit link and verifier feedback', async () => {
    getProblems.mockResolvedValue({
      data: [problem({ status: 'PRIVATE', verifier_feedback: 'Needs work' })],
    });
    renderWithProviders(<MyCreatedProblemsPage />);
    expect(await screen.findByRole('link', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByText(/Needs work/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit for Approval' })).not.toBeInTheDocument();
  });

  it('renders a PRIVATE problem without feedback (no feedback paragraph)', async () => {
    getProblems.mockResolvedValue({
      data: [problem({ status: 'PRIVATE', verifier_feedback: null })],
    });
    renderWithProviders(<MyCreatedProblemsPage />);
    await screen.findByRole('link', { name: 'My Problem' });
    expect(screen.queryByText(/Feedback:/)).not.toBeInTheDocument();
  });

  it('renders a PUBLISHED problem with neither edit nor submit controls', async () => {
    getProblems.mockResolvedValue({ data: [problem({ status: 'PUBLISHED' })] });
    renderWithProviders(<MyCreatedProblemsPage />);
    await screen.findByRole('link', { name: 'My Problem' });
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit for Approval' })).not.toBeInTheDocument();
  });

  it('shows an error when loading fails (with message)', async () => {
    getProblems.mockRejectedValue(new Error('load fail'));
    renderWithProviders(<MyCreatedProblemsPage />);
    expect(await screen.findByText('load fail')).toBeInTheDocument();
  });

  it('shows the default error when loading fails without a message', async () => {
    getProblems.mockRejectedValue({});
    renderWithProviders(<MyCreatedProblemsPage />);
    expect(await screen.findByText('Failed to load your problems.')).toBeInTheDocument();
  });

  it('shows an auth-required error when the user is not authenticated', async () => {
    localStorage.clear();
    renderWithProviders(<MyCreatedProblemsPage />);
    expect(await screen.findByText('Authentication required.')).toBeInTheDocument();
  });

  it('stays loading when a token exists but the user is not yet hydrated', async () => {
    // token present (isAuthenticated true) but no stored user -> user.id is
    // undefined, so neither effect branch runs (else-if condition is false).
    localStorage.clear();
    localStorage.setItem('accessToken', 'tok');
    renderWithProviders(<MyCreatedProblemsPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(getProblems).not.toHaveBeenCalled();
  });

  it('submits a draft for approval and toasts success', async () => {
    getProblems.mockResolvedValue({ data: [problem({ status: 'DRAFT' })] });
    submitForApproval.mockResolvedValue({});
    renderWithProviders(<MyCreatedProblemsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Submit for Approval' }));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('Problem submitted for approval!'),
    );
    expect(submitForApproval).toHaveBeenCalledWith(1);
  });

  it('only updates the submitted problem when several drafts are listed', async () => {
    getProblems.mockResolvedValue({
      data: [
        problem({ id: 1, status: 'DRAFT', title_i18n: { en: 'First' } }),
        problem({ id: 2, status: 'DRAFT', title_i18n: { en: 'Second' } }),
      ],
    });
    submitForApproval.mockResolvedValue({});
    renderWithProviders(<MyCreatedProblemsPage />);
    await screen.findByRole('link', { name: 'First' });
    // submit the FIRST draft; the map must leave the SECOND draft untouched
    // (exercises the `: p` else branch over a non-matching id).
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit for Approval' })[0]);
    // after the state update the submitted draft loses its button; the second
    // draft (left untouched by the map's `: p` branch) keeps exactly one.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Submit for Approval' }).length).toBe(1),
    );
    expect(submitForApproval).toHaveBeenCalledWith(1);
    // the surviving button belongs to the untouched second draft
    expect(screen.getByRole('link', { name: 'Second' })).toBeInTheDocument();
  });

  it('toasts the error message when submit-for-approval fails', async () => {
    getProblems.mockResolvedValue({ data: [problem({ status: 'DRAFT' })] });
    submitForApproval.mockRejectedValue(new Error('rejected'));
    renderWithProviders(<MyCreatedProblemsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Submit for Approval' }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Failed to submit for approval: rejected'),
    );
  });

  it('toasts a generic suffix when the submit error has no message', async () => {
    getProblems.mockResolvedValue({ data: [problem({ status: 'DRAFT' })] });
    submitForApproval.mockRejectedValue({});
    renderWithProviders(<MyCreatedProblemsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Submit for Approval' }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Failed to submit for approval: Unknown error'),
    );
  });
});
