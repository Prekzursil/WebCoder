import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { useParams, useNavigate } from 'react-router';
import ProblemFormPage from './ProblemFormPage';
import { renderWithProviders, seedAuthUser, makeUser } from '../../test-utils';
import { ProblemService, TestCaseService } from '../../services/ApiService';
import * as authModule from '../../context/AuthContext';

jest.mock('react-router', () => {
  const actual = jest.requireActual('react-router');
  return { ...actual, useParams: jest.fn(), useNavigate: jest.fn() };
});

jest.mock('../../services/ApiService', () => ({
  ProblemService: {
    getTags: jest.fn(),
    getProblemDetail: jest.fn(),
    createProblem: jest.fn(),
    updateProblem: jest.fn(),
  },
  TestCaseService: {
    createTestCase: jest.fn(),
    deleteTestCase: jest.fn(),
  },
  AuthService: { getMe: jest.fn(() => new Promise(() => undefined)) },
}));

const useParamsMock = useParams as jest.Mock;
const useNavigateMock = useNavigate as jest.Mock;
const getTags = ProblemService.getTags as jest.Mock;
const getProblemDetail = ProblemService.getProblemDetail as jest.Mock;
const createProblem = ProblemService.createProblem as jest.Mock;
const updateProblem = ProblemService.updateProblem as jest.Mock;
const createTestCase = TestCaseService.createTestCase as jest.Mock;
const deleteTestCase = TestCaseService.deleteTestCase as jest.Mock;

const navigate = jest.fn();

const tag = (id: number, name: Record<string, string>, slug = `slug-${id}`): TagShape => ({
  id,
  name_i18n: name,
  slug,
});
interface TagShape {
  id: number;
  name_i18n: Record<string, string>;
  slug: string;
}

const fillRequired = (): void => {
  fireEvent.change(screen.getByLabelText('Title (English):'), { target: { value: 'T en' } });
  fireEvent.change(screen.getByLabelText('Title (Romanian):'), { target: { value: 'T ro' } });
  fireEvent.change(screen.getByLabelText('Statement (English):'), { target: { value: 'S en' } });
  fireEvent.change(screen.getByLabelText('Statement (Romanian):'), { target: { value: 'S ro' } });
};

const submitForm = (): void => {
  fireEvent.submit(
    screen.getByRole('button', { name: 'Create Problem' }).closest('form') as HTMLFormElement,
  );
};

beforeEach(() => {
  [
    getTags,
    getProblemDetail,
    createProblem,
    updateProblem,
    createTestCase,
    deleteTestCase,
    navigate,
  ].forEach((m) => m.mockReset());
  useParamsMock.mockReturnValue({});
  useNavigateMock.mockReturnValue(navigate);
  getTags.mockResolvedValue({ data: [] });
  seedAuthUser(makeUser({ id: 9, role: 'PROBLEM_CREATOR' }));
});
afterEach(() => localStorage.clear());

describe('ProblemFormPage - create mode', () => {
  it('renders the create header and fetches tags', async () => {
    getTags.mockResolvedValue({ data: [tag(1, { en: 'Math', ro: 'Mate' })] });
    renderWithProviders(<ProblemFormPage />);
    expect(await screen.findByRole('heading', { name: 'Create New Problem' })).toBeInTheDocument();
    // tag checkbox rendered from fetched tags
    expect(await screen.findByLabelText('Math')).toBeInTheDocument();
  });

  it('logs an error when tag fetching fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    getTags.mockRejectedValue(new Error('tags down'));
    renderWithProviders(<ProblemFormPage />);
    await screen.findByRole('heading', { name: 'Create New Problem' });
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith('Failed to fetch tags', expect.anything()),
    );
    spy.mockRestore();
  });

  it('toggles a tag selection on and off', async () => {
    getTags.mockResolvedValue({ data: [tag(3, { en: 'DP' })] });
    renderWithProviders(<ProblemFormPage />);
    const cb = (await screen.findByLabelText('DP')) as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    expect(cb.checked).toBe(false);
  });

  it('falls back to slug then en for a tag label', async () => {
    getTags.mockResolvedValue({ data: [tag(4, {}, 'graphs')] });
    renderWithProviders(<ProblemFormPage />);
    expect(await screen.findByText('graphs')).toBeInTheDocument();
  });

  it('toggles an allowed-language checkbox off and on', async () => {
    renderWithProviders(<ProblemFormPage />);
    const py = (await screen.findByLabelText('python3')) as HTMLInputElement;
    expect(py.checked).toBe(true);
    fireEvent.click(py);
    expect(py.checked).toBe(false);
    fireEvent.click(py);
    expect(py.checked).toBe(true);
  });

  it('updates config numeric and select fields', async () => {
    renderWithProviders(<ProblemFormPage />);
    await screen.findByRole('heading', { name: 'Create New Problem' });
    fireEvent.change(screen.getByLabelText('Difficulty:'), { target: { value: 'HARD' } });
    fireEvent.change(screen.getByLabelText('Time Limit (ms):'), { target: { value: '2000' } });
    fireEvent.change(screen.getByLabelText('Memory Limit (KB):'), { target: { value: '1024' } });
    fireEvent.change(screen.getByLabelText('Status:'), { target: { value: 'APPROVED' } });
    expect((screen.getByLabelText('Difficulty:') as HTMLSelectElement).value).toBe('HARD');
    expect((screen.getByLabelText('Status:') as HTMLSelectElement).value).toBe('APPROVED');
  });

  it('shows the float epsilon field and edits it for FLOAT_PRECISE mode', async () => {
    renderWithProviders(<ProblemFormPage />);
    fireEvent.change(await screen.findByLabelText('Comparison Mode:'), {
      target: { value: 'FLOAT_PRECISE' },
    });
    const eps = (await screen.findByLabelText('problem_form_float_epsilon:')) as HTMLInputElement;
    fireEvent.change(eps, { target: { value: '0.01' } });
    expect(eps.value).toBe('0.01');
    // clearing it sets epsilon to null (empty input branch)
    fireEvent.change(eps, { target: { value: '' } });
    expect(eps.value).toBe('');
  });

  it('shows checker fields and edits them for CUSTOM_CHECKER mode', async () => {
    renderWithProviders(<ProblemFormPage />);
    fireEvent.change(await screen.findByLabelText('Comparison Mode:'), {
      target: { value: 'CUSTOM_CHECKER' },
    });
    const lang = (await screen.findByLabelText(
      'problem_form_checker_language:',
    )) as HTMLSelectElement;
    fireEvent.change(lang, { target: { value: 'python3' } });
    expect(lang.value).toBe('python3');
    const codeArea = screen.getByLabelText('problem_form_checker_code:') as HTMLTextAreaElement;
    fireEvent.change(codeArea, { target: { value: 'print(1)' } });
    expect(codeArea.value).toBe('print(1)');
    // reset language to '' -> setCheckerLanguage(null) branch, code to '' -> null branch
    fireEvent.change(lang, { target: { value: '' } });
    fireEvent.change(codeArea, { target: { value: '' } });
    expect(codeArea.value).toBe('');
  });

  it('warns when adding a test case with empty input or output', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => undefined);
    renderWithProviders(<ProblemFormPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add Test Case' }));
    expect(alertSpy).toHaveBeenCalledWith('Test case input and output cannot be empty.');
    alertSpy.mockRestore();
  });

  it('shows an auth error when adding a test case without a token', async () => {
    localStorage.clear();
    localStorage.setItem('user', JSON.stringify(makeUser()));
    renderWithProviders(<ProblemFormPage />);
    fireEvent.change(await screen.findByLabelText('Input Data:'), { target: { value: 'in' } });
    fireEvent.change(screen.getByLabelText('Expected Output Data:'), { target: { value: 'out' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));
    expect(await screen.findByText('Authentication required.')).toBeInTheDocument();
  });

  it('adds a test case locally in create mode and allows local removal', async () => {
    renderWithProviders(<ProblemFormPage />);
    fireEvent.change(await screen.findByLabelText('Input Data:'), { target: { value: '1 2' } });
    fireEvent.change(screen.getByLabelText('Expected Output Data:'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Points:'), { target: { value: '20' } });
    fireEvent.click(screen.getByLabelText('Is Sample?:'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));
    expect(await screen.findByText('1 2')).toBeInTheDocument();
    expect(screen.getByText(/\(Sample\)/)).toBeInTheDocument();
    expect(createTestCase).not.toHaveBeenCalled();
    // local removal (no id) path
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByText('1 2')).not.toBeInTheDocument());
  });

  it('coerces an invalid points value to zero', async () => {
    renderWithProviders(<ProblemFormPage />);
    const points = (await screen.findByLabelText('Points:')) as HTMLInputElement;
    fireEvent.change(points, { target: { value: 'abc' } });
    expect(points.value).toBe('0');
  });

  it('shows an auth error on submit without a token', async () => {
    localStorage.clear();
    localStorage.setItem('user', JSON.stringify(makeUser()));
    renderWithProviders(<ProblemFormPage />);
    await screen.findByRole('heading', { name: 'Create New Problem' });
    fillRequired();
    submitForm();
    expect(await screen.findByText('Authentication required.')).toBeInTheDocument();
  });

  it('creates a problem, saves its test cases and navigates to edit', async () => {
    createProblem.mockResolvedValue({ data: { id: 77 } });
    createTestCase.mockResolvedValueOnce({ data: { id: 1 } });
    renderWithProviders(<ProblemFormPage />);
    await screen.findByRole('heading', { name: 'Create New Problem' });
    fillRequired();
    // add one local test case so the save-loop runs
    fireEvent.change(screen.getByLabelText('Input Data:'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('Expected Output Data:'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));
    await screen.findByText('a');
    submitForm();
    await waitFor(() => expect(createProblem).toHaveBeenCalled());
    await waitFor(() =>
      expect(createTestCase).toHaveBeenCalledWith(expect.objectContaining({ problem: 77 })),
    );
    expect(navigate).toHaveBeenCalledWith('/problems/77/edit');
  });

  it('logs but continues when a test case fails to save during create', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    createProblem.mockResolvedValue({ data: { id: 88 } });
    createTestCase.mockRejectedValue(new Error('tc save fail'));
    renderWithProviders(<ProblemFormPage />);
    await screen.findByRole('heading', { name: 'Create New Problem' });
    fillRequired();
    fireEvent.change(screen.getByLabelText('Input Data:'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('Expected Output Data:'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));
    await screen.findByText('a');
    submitForm();
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        'Failed to save a test case for new problem:',
        expect.anything(),
      ),
    );
    expect(navigate).toHaveBeenCalledWith('/problems/88/edit');
    spy.mockRestore();
  });

  it('creates a problem without an id and skips the test-case loop', async () => {
    createProblem.mockResolvedValue({ data: {} });
    renderWithProviders(<ProblemFormPage />);
    await screen.findByRole('heading', { name: 'Create New Problem' });
    fillRequired();
    submitForm();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/problems/undefined/edit'));
    expect(createTestCase).not.toHaveBeenCalled();
  });

  it('formats a structured validation error from the API', async () => {
    createProblem.mockRejectedValue({
      response: { data: { title_i18n: ['too short', 'required'], status: 'invalid' } },
    });
    renderWithProviders(<ProblemFormPage />);
    await screen.findByRole('heading', { name: 'Create New Problem' });
    fillRequired();
    submitForm();
    expect(
      await screen.findByText(/title_i18n: too short, required; status: invalid/),
    ).toBeInTheDocument();
  });

  it('shows the error message for a plain create failure', async () => {
    createProblem.mockRejectedValue(new Error('boom create'));
    renderWithProviders(<ProblemFormPage />);
    await screen.findByRole('heading', { name: 'Create New Problem' });
    fillRequired();
    submitForm();
    expect(await screen.findByText('boom create')).toBeInTheDocument();
  });

  it('shows the default error when create fails without a message', async () => {
    createProblem.mockRejectedValue({});
    renderWithProviders(<ProblemFormPage />);
    await screen.findByRole('heading', { name: 'Create New Problem' });
    fillRequired();
    submitForm();
    expect(await screen.findByText('Failed to save problem.')).toBeInTheDocument();
  });

  it('sends the float epsilon in the payload for FLOAT_PRECISE mode', async () => {
    createProblem.mockResolvedValue({ data: { id: 1 } });
    renderWithProviders(<ProblemFormPage />);
    await screen.findByRole('heading', { name: 'Create New Problem' });
    fillRequired();
    fireEvent.change(screen.getByLabelText('Comparison Mode:'), {
      target: { value: 'FLOAT_PRECISE' },
    });
    submitForm();
    await waitFor(() =>
      expect(createProblem).toHaveBeenCalledWith(
        expect.objectContaining({
          float_comparison_epsilon: 1e-6,
          comparison_mode: 'FLOAT_PRECISE',
        }),
      ),
    );
  });

  it('sends checker code and language in the payload for CUSTOM_CHECKER mode', async () => {
    createProblem.mockResolvedValue({ data: { id: 1 } });
    renderWithProviders(<ProblemFormPage />);
    await screen.findByRole('heading', { name: 'Create New Problem' });
    fillRequired();
    fireEvent.change(screen.getByLabelText('Comparison Mode:'), {
      target: { value: 'CUSTOM_CHECKER' },
    });
    fireEvent.change(screen.getByLabelText('problem_form_checker_language:'), {
      target: { value: 'cpp17' },
    });
    fireEvent.change(screen.getByLabelText('problem_form_checker_code:'), {
      target: { value: 'int main(){}' },
    });
    submitForm();
    await waitFor(() =>
      expect(createProblem).toHaveBeenCalledWith(
        expect.objectContaining({
          comparison_mode: 'CUSTOM_CHECKER',
          checker_code: 'int main(){}',
          checker_language: 'cpp17',
        }),
      ),
    );
  });

  it('falls back to the default save error when the API returns an empty error object', async () => {
    createProblem.mockRejectedValue({ response: { data: {} } });
    renderWithProviders(<ProblemFormPage />);
    await screen.findByRole('heading', { name: 'Create New Problem' });
    fillRequired();
    submitForm();
    expect(await screen.findByText('Failed to save problem.')).toBeInTheDocument();
  });
});

describe('ProblemFormPage - edit mode', () => {
  beforeEach(() => useParamsMock.mockReturnValue({ problemId: '42' }));

  const editProblem = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    title_i18n: { en: 'Edit En', ro: 'Edit Ro' },
    statement_i18n: { en: 'St En', ro: 'St Ro' },
    difficulty: 'MEDIUM',
    default_time_limit_ms: 1500,
    default_memory_limit_kb: 65536,
    status: 'APPROVED',
    allowed_languages: ['python3'],
    comparison_mode: 'FLOAT_PRECISE',
    float_comparison_epsilon: 0.001,
    checker_code: null,
    checker_language: null,
    tags: [{ id: 1, name_i18n: { en: 'Math' }, slug: 'math' }],
    test_cases: [
      { id: 5, input_data: 'i', expected_output_data: 'o', is_sample: true, points: 10 },
    ],
    ...overrides,
  });

  it('shows the loading spinner then the populated edit form', async () => {
    let resolve!: (v: unknown) => void;
    getProblemDetail.mockReturnValue(new Promise((r) => (resolve = r)));
    renderWithProviders(<ProblemFormPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    resolve({ data: editProblem() });
    expect(await screen.findByRole('heading', { name: 'Edit Problem' })).toBeInTheDocument();
    expect((screen.getByLabelText('Title (English):') as HTMLInputElement).value).toBe('Edit En');
    expect(screen.getByText('i')).toBeInTheDocument();
  });

  it('applies field defaults when the loaded problem omits values', async () => {
    getProblemDetail.mockResolvedValue({
      data: {
        title_i18n: {},
        statement_i18n: {},
        float_comparison_epsilon: null,
        tags: undefined,
        test_cases: undefined,
      },
    });
    renderWithProviders(<ProblemFormPage />);
    await screen.findByRole('heading', { name: 'Edit Problem' });
    expect((screen.getByLabelText('Difficulty:') as HTMLSelectElement).value).toBe('EASY');
    expect((screen.getByLabelText('Status:') as HTMLSelectElement).value).toBe('DRAFT');
  });

  it('shows an error when loading the problem for edit fails', async () => {
    getProblemDetail.mockRejectedValue(new Error('load fail'));
    renderWithProviders(<ProblemFormPage />);
    expect(await screen.findByText('Failed to load problem for editing.')).toBeInTheDocument();
  });

  it('adds a test case via the API in edit mode', async () => {
    getProblemDetail.mockResolvedValue({ data: editProblem({ test_cases: [] }) });
    createTestCase.mockResolvedValue({ data: { id: 99 } });
    renderWithProviders(<ProblemFormPage />);
    await screen.findByRole('heading', { name: 'Edit Problem' });
    fireEvent.change(screen.getByLabelText('Input Data:'), { target: { value: 'in' } });
    fireEvent.change(screen.getByLabelText('Expected Output Data:'), { target: { value: 'out' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));
    expect(await screen.findByText('Test case added successfully!')).toBeInTheDocument();
    expect(createTestCase).toHaveBeenCalledWith(
      expect.objectContaining({ problem: 42, input_data: 'in' }),
    );
  });

  it('shows an error when adding a test case via the API fails', async () => {
    getProblemDetail.mockResolvedValue({ data: editProblem({ test_cases: [] }) });
    createTestCase.mockRejectedValue(new Error('add fail'));
    renderWithProviders(<ProblemFormPage />);
    await screen.findByRole('heading', { name: 'Edit Problem' });
    fireEvent.change(screen.getByLabelText('Input Data:'), { target: { value: 'in' } });
    fireEvent.change(screen.getByLabelText('Expected Output Data:'), { target: { value: 'out' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));
    expect(await screen.findByText('add fail')).toBeInTheDocument();
  });

  it('removes a persisted test case via the API', async () => {
    getProblemDetail.mockResolvedValue({ data: editProblem() });
    deleteTestCase.mockResolvedValue({});
    renderWithProviders(<ProblemFormPage />);
    await screen.findByText('i');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Test case removed successfully!')).toBeInTheDocument();
    expect(deleteTestCase).toHaveBeenCalledWith(5);
  });

  it('shows an error when removing a persisted test case fails', async () => {
    getProblemDetail.mockResolvedValue({ data: editProblem() });
    deleteTestCase.mockRejectedValue(new Error('del fail'));
    renderWithProviders(<ProblemFormPage />);
    await screen.findByText('i');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('del fail')).toBeInTheDocument();
  });

  it('updates the problem and shows a success message', async () => {
    getProblemDetail.mockResolvedValue({ data: editProblem() });
    updateProblem.mockResolvedValue({ data: {} });
    renderWithProviders(<ProblemFormPage />);
    await screen.findByRole('heading', { name: 'Edit Problem' });
    fireEvent.submit(
      screen.getByRole('button', { name: 'Save Changes' }).closest('form') as HTMLFormElement,
    );
    expect(await screen.findByText('Problem updated successfully!')).toBeInTheDocument();
    expect(updateProblem).toHaveBeenCalledWith('42', expect.any(Object));
  });

  it('shows the default add-test-case error when the failure has no message', async () => {
    getProblemDetail.mockResolvedValue({ data: editProblem({ test_cases: [] }) });
    createTestCase.mockRejectedValue({});
    renderWithProviders(<ProblemFormPage />);
    await screen.findByRole('heading', { name: 'Edit Problem' });
    fireEvent.change(screen.getByLabelText('Input Data:'), { target: { value: 'in' } });
    fireEvent.change(screen.getByLabelText('Expected Output Data:'), { target: { value: 'out' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));
    expect(await screen.findByText('Failed to add test case.')).toBeInTheDocument();
  });

  it('shows the default remove error when the failure has no message', async () => {
    getProblemDetail.mockResolvedValue({ data: editProblem() });
    deleteTestCase.mockRejectedValue({});
    renderWithProviders(<ProblemFormPage />);
    await screen.findByText('i');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Failed to remove test case.')).toBeInTheDocument();
  });
});

// Removing a test case requires test cases to be loaded (which needs a token),
// but the guard fires only when the token is gone — i.e. it expired between load
// and the remove click. We reproduce that by controlling useAuth's token.
describe('ProblemFormPage - token lost mid-session', () => {
  it('shows an auth error when removing a test case without a token', async () => {
    let token: string | null = 'tok';
    jest.spyOn(authModule, 'useAuth').mockImplementation(() => ({
      isAuthenticated: !!token,
      token,
      refreshToken: null,
      user: makeUser(),
      login: jest.fn(),
      logout: jest.fn(),
    }));
    useParamsMock.mockReturnValue({ problemId: '42' });
    getProblemDetail.mockResolvedValue({
      data: {
        title_i18n: { en: 'E' },
        statement_i18n: { en: 'S' },
        test_cases: [
          { id: 5, input_data: 'i', expected_output_data: 'o', is_sample: false, points: 1 },
        ],
      },
    });
    renderWithProviders(<ProblemFormPage />, { withAuth: false });
    await screen.findByText('i');
    // token "expires" before the remove click; a field change forces a re-render
    // so the component re-reads the (now token-less) auth context.
    token = null;
    fireEvent.change(screen.getByLabelText('Title (English):'), { target: { value: 'changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Authentication required.')).toBeInTheDocument();
    expect(deleteTestCase).not.toHaveBeenCalled();
    (authModule.useAuth as jest.Mock).mockRestore();
  });
});
