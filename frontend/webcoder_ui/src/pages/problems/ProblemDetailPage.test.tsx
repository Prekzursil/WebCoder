import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { useParams } from 'react-router';
import ProblemDetailPage from './ProblemDetailPage';
import { renderWithProviders, seedAuthUser, makeUser } from '../../test-utils';
import { ProblemService, SubmissionService } from '../../services/ApiService';

jest.mock('react-router', () => {
  const actual = jest.requireActual('react-router');
  return { ...actual, useParams: jest.fn() };
});

jest.mock('../../services/ApiService', () => ({
  ProblemService: { getProblemDetail: jest.fn() },
  SubmissionService: { createSubmission: jest.fn() },
  AuthService: { getMe: jest.fn(() => new Promise(() => undefined)) },
}));

const useParamsMock = useParams as jest.Mock;
const getProblemDetail = ProblemService.getProblemDetail as jest.Mock;
const createSubmission = SubmissionService.createSubmission as jest.Mock;

const fullProblem = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 42,
  title_i18n: { en: 'Two Sum' },
  difficulty: 'EASY',
  status: 'PUBLISHED',
  statement_i18n: { en: 'Add two numbers.\nReturn the sum.' },
  default_time_limit_ms: 1000,
  default_memory_limit_kb: 65536,
  allowed_languages: ['python3', 'cpp'],
  test_cases: [
    { input_data: '1 2', expected_output_data: '3', is_sample: true },
    { input_data: '9 9', expected_output_data: '18', is_sample: false },
  ],
  ...overrides,
});

const renderAuthed = (): ReturnType<typeof renderWithProviders> => {
  seedAuthUser(makeUser({ id: 7 }));
  return renderWithProviders(<ProblemDetailPage />);
};

describe('ProblemDetailPage', () => {
  beforeEach(() => {
    getProblemDetail.mockReset();
    createSubmission.mockReset();
    useParamsMock.mockReturnValue({ problemId: '42' });
  });
  afterEach(() => localStorage.clear());

  it('shows the loading spinner while fetching', () => {
    getProblemDetail.mockReturnValue(new Promise(() => undefined));
    renderAuthed();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('does nothing when there is no problemId (early return)', () => {
    useParamsMock.mockReturnValue({ problemId: undefined });
    renderAuthed();
    // effect early-returns; fetch never called and we sit in loading state.
    expect(getProblemDetail).not.toHaveBeenCalled();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders an error with message when the fetch rejects', async () => {
    getProblemDetail.mockRejectedValue(new Error('boom'));
    renderAuthed();
    expect(await screen.findByText('boom')).toBeInTheDocument();
  });

  it('renders the default error when the fetch rejects without a message', async () => {
    getProblemDetail.mockRejectedValue({});
    renderAuthed();
    expect(await screen.findByText('Failed to load problem details.')).toBeInTheDocument();
  });

  it('renders the not-found message when the fetch resolves null', async () => {
    getProblemDetail.mockResolvedValue({ data: null });
    renderAuthed();
    expect(await screen.findByText('Problem not found.')).toBeInTheDocument();
  });

  it('renders full problem details for an authenticated user', async () => {
    getProblemDetail.mockResolvedValue({ data: fullProblem() });
    renderAuthed();
    expect(await screen.findByRole('heading', { name: 'Two Sum' })).toBeInTheDocument();
    expect(screen.getByText('Time Limit:')).toBeInTheDocument();
    expect(screen.getByText(/1000 ms/)).toBeInTheDocument();
    expect(screen.getByText('Memory Limit:')).toBeInTheDocument();
    expect(screen.getByText(/65536 KB/)).toBeInTheDocument();
    // only the sample test case is rendered
    expect(screen.getByText('1 2')).toBeInTheDocument();
    expect(screen.queryByText('9 9')).not.toBeInTheDocument();
    // authenticated => submit form present, language preselected to first allowed
    expect((screen.getByLabelText('Language:') as HTMLSelectElement).value).toBe('python3');
  });

  it('falls back to the problem id label when no title translation exists', async () => {
    getProblemDetail.mockResolvedValue({ data: fullProblem({ title_i18n: {} }) });
    renderAuthed();
    expect(await screen.findByRole('heading', { name: 'Problem ID: 42' })).toBeInTheDocument();
  });

  it('renders a multi-line statement as escaped text with line breaks (no HTML injection)', async () => {
    getProblemDetail.mockResolvedValue({
      data: fullProblem({
        statement_i18n: { en: 'Line one\n<img src=x onerror="alert(1)">' },
      }),
    });
    const { container } = renderAuthed();
    await screen.findByRole('heading', { name: 'Two Sum' });
    // The statement <div> follows the "Problem Statement" header.
    const header = screen.getByRole('heading', { name: 'Problem Statement' });
    const statementDiv = header.nextElementSibling as HTMLElement;
    // Newlines become <br> elements (line-break behavior preserved).
    expect(statementDiv.querySelectorAll('br')).toHaveLength(1);
    // The raw HTML is rendered as TEXT, escaped — the <img> sink is NOT created.
    expect(statementDiv.querySelector('img')).toBeNull();
    expect(statementDiv.textContent).toContain('<img src=x onerror="alert(1)">');
    // And nothing in the document used dangerouslySetInnerHTML to inject it.
    expect(container.querySelector('img[onerror]')).toBeNull();
  });

  it('omits limits, statement and samples when they are absent', async () => {
    getProblemDetail.mockResolvedValue({
      data: fullProblem({
        default_time_limit_ms: undefined,
        default_memory_limit_kb: undefined,
        statement_i18n: undefined,
        test_cases: undefined,
      }),
    });
    renderAuthed();
    await screen.findByRole('heading', { name: 'Two Sum' });
    expect(screen.queryByText('Time Limit:')).not.toBeInTheDocument();
    expect(screen.queryByText('Memory Limit:')).not.toBeInTheDocument();
    expect(screen.queryByText('Sample Test Cases')).not.toBeInTheDocument();
  });

  it('defaults the language to python3 when no languages are allowed', async () => {
    getProblemDetail.mockResolvedValue({
      data: fullProblem({ allowed_languages: [] }),
    });
    renderAuthed();
    // The else-if branch sets selectedLanguage to 'python3', but with no
    // allowed_languages there is no matching <option>, so the disabled select
    // falls back to its empty placeholder value.
    const select = (await screen.findByLabelText('Language:')) as HTMLSelectElement;
    expect(select).toBeDisabled();
    expect(select.value).toBe('');
  });

  it('disables the language select and renders no options when allowed_languages is undefined', async () => {
    getProblemDetail.mockResolvedValue({
      data: fullProblem({ allowed_languages: undefined }),
    });
    renderAuthed();
    const select = (await screen.findByLabelText('Language:')) as HTMLSelectElement;
    expect(select).toBeDisabled();
    // only the disabled placeholder option exists (the `|| []` fallback path)
    expect(select.querySelectorAll('option')).toHaveLength(1);
  });

  it('shows a login prompt instead of the form for anonymous users', async () => {
    getProblemDetail.mockResolvedValue({ data: fullProblem() });
    // Mount inside AuthProvider but with no seeded user => not authenticated.
    renderWithProviders(<ProblemDetailPage />);
    await screen.findByRole('heading', { name: 'Two Sum' });
    expect(screen.getByRole('link', { name: 'login' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Code:')).not.toBeInTheDocument();
  });

  it('blocks submit and warns when the code is only whitespace', async () => {
    getProblemDetail.mockResolvedValue({ data: fullProblem() });
    renderAuthed();
    const code = (await screen.findByLabelText('Code:')) as HTMLTextAreaElement;
    // Whitespace settles the [code, selectedLanguage] reset effect first, then
    // trims to empty so handleSubmitClick takes the "code empty" branch.
    fireEvent.change(code, { target: { value: '   ' } });
    fireEvent.submit(code.closest('form') as HTMLFormElement);
    expect(await screen.findByText(/Code cannot be empty\./)).toBeInTheDocument();
    expect(createSubmission).not.toHaveBeenCalled();
  });

  it('resets submission feedback when the code changes', async () => {
    getProblemDetail.mockResolvedValue({ data: fullProblem() });
    renderAuthed();
    const code = (await screen.findByLabelText('Code:')) as HTMLTextAreaElement;
    fireEvent.change(code, { target: { value: '   ' } });
    fireEvent.submit(code.closest('form') as HTMLFormElement);
    expect(await screen.findByText(/Code cannot be empty\./)).toBeInTheDocument();
    // changing the code triggers the [code, selectedLanguage] effect that clears
    // the prior submission feedback.
    fireEvent.change(code, { target: { value: 'print(1)' } });
    await waitFor(() =>
      expect(screen.queryByText(/Code cannot be empty\./)).not.toBeInTheDocument(),
    );
  });

  it('submits successfully through the confirmation modal', async () => {
    getProblemDetail.mockResolvedValue({ data: fullProblem() });
    createSubmission.mockResolvedValue({ data: { id: 99 } });
    renderAuthed();
    const code = (await screen.findByLabelText('Code:')) as HTMLTextAreaElement;
    fireEvent.change(code, { target: { value: 'print(3)' } });
    fireEvent.change(screen.getByLabelText('Language:'), { target: { value: 'cpp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    // confirmation modal opened
    const confirm = await screen.findByRole('button', { name: 'Confirm' });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(createSubmission).toHaveBeenCalledWith({
        problem: 42,
        language: 'cpp',
        code: 'print(3)',
      }),
    );
    // success resets the code textarea
    await waitFor(() => expect((code as HTMLTextAreaElement).value).toBe(''));
  });

  it('shows the error message when the submission fails', async () => {
    getProblemDetail.mockResolvedValue({ data: fullProblem() });
    createSubmission.mockRejectedValue(new Error('server down'));
    renderAuthed();
    const code = (await screen.findByLabelText('Code:')) as HTMLTextAreaElement;
    fireEvent.change(code, { target: { value: 'print(3)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('server down')).toBeInTheDocument();
  });

  it('shows the default error when the submission fails without a message', async () => {
    getProblemDetail.mockResolvedValue({ data: fullProblem() });
    createSubmission.mockRejectedValue({});
    renderAuthed();
    const code = (await screen.findByLabelText('Code:')) as HTMLTextAreaElement;
    fireEvent.change(code, { target: { value: 'print(3)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Submission failed.')).toBeInTheDocument();
  });

  it('closes the modal without submitting when cancelled', async () => {
    getProblemDetail.mockResolvedValue({ data: fullProblem() });
    renderAuthed();
    const code = (await screen.findByLabelText('Code:')) as HTMLTextAreaElement;
    fireEvent.change(code, { target: { value: 'print(3)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    fireEvent.click(cancel);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument(),
    );
    expect(createSubmission).not.toHaveBeenCalled();
  });
});
