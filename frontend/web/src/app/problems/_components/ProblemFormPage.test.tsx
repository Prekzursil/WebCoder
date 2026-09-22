import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import type { ProblemType, TagType } from '@/types';
import ProblemFormPage from './ProblemFormPage';

// Shared mutable auth state: useAuth() returns this object, so tests can flip
// fields (e.g. null the token) between render and interaction, exactly like a
// logout happening mid-session.
const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  token: 'token-1' as string | null,
  refreshToken: 'refresh-1' as string | null,
  user: {
    id: 7,
    username: 'creator',
    email: 'creator@example.com',
    role: 'PROBLEM_CREATOR',
  } as { id: number; username: string; email: string; role: string } | null,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => authState,
}));

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: vi.fn(() => ({})),
}));

vi.mock('next/navigation', () => ({
  useParams: () => nav.params(),
  useRouter: () => ({
    push: nav.push,
    replace: nav.replace,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
}));

const api = vi.hoisted(() => ({
  getTags: vi.fn(),
  getProblemDetail: vi.fn(),
  createProblem: vi.fn(),
  updateProblem: vi.fn(),
  createTestCase: vi.fn(),
  deleteTestCase: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  ProblemService: {
    getTags: api.getTags,
    getProblemDetail: api.getProblemDetail,
    createProblem: api.createProblem,
    updateProblem: api.updateProblem,
  },
  TestCaseService: {
    createTestCase: api.createTestCase,
    deleteTestCase: api.deleteTestCase,
  },
}));

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({
  // The ported pages use the default import (`import toast from ...`),
  // so the mock must provide both shapes.
  default: toasts,
  toast: toasts,
}));

const fullProblem = {
  id: 12,
  title_i18n: { en: 'Full Problem', ro: 'Problema Completă' },
  statement_i18n: { en: 'Statement EN', ro: 'Enunț RO' },
  difficulty: 'HARD',
  status: 'PRIVATE',
  default_time_limit_ms: 2000,
  default_memory_limit_kb: 131072,
  allowed_languages: ['java11'],
  comparison_mode: 'CUSTOM_CHECKER',
  float_comparison_epsilon: 0.5,
  checker_code: 'print("chk")',
  checker_language: 'cpp17',
  tags: [{ id: 3, name_i18n: { en: 'Greedy' }, slug: 'greedy' }],
  test_cases: [
    { id: 51, input_data: 'in-a', expected_output_data: 'out-a', is_sample: true, points: 5, order: 1 },
    { id: 51 + 1, input_data: 'in-b', expected_output_data: 'out-b', is_sample: false, points: 15, order: 2 },
  ],
} as unknown as ProblemType;

// Only the fields ProblemType requires; everything optional is absent, which
// exercises every `?.` / `||` default on the edit-prefill path.
const sparseProblem = { id: 9, difficulty: '', status: '' } as unknown as ProblemType;

const createdProblem = { id: 42, title_i18n: {}, difficulty: 'EASY', status: 'DRAFT' } as unknown as ProblemType;

const TAGS: TagType[] = [
  { id: 1, name_i18n: { en: 'DP', ro: 'PD' }, slug: 'dp' },
  { id: 2, name_i18n: { en: 'Math' }, slug: 'math' },
  { id: 4, name_i18n: { ro: 'Doar Ro' }, slug: 'ro-only' },
];

function fillRequiredCreateFields() {
  fireEvent.change(screen.getByLabelText('Title (English):'), { target: { value: 'My Title' } });
  fireEvent.change(screen.getByLabelText('Title (Romanian):'), { target: { value: 'Titlul Meu' } });
  fireEvent.change(screen.getByLabelText('Statement (English):'), { target: { value: 'Stmt EN' } });
  fireEvent.change(screen.getByLabelText('Statement (Romanian):'), { target: { value: 'Enunț RO' } });
}

function submitForm() {
  fireEvent.submit(screen.getByRole('button', { name: 'Create Problem' }).closest('form')!);
}

beforeEach(() => {
  vi.clearAllMocks();
  nav.params.mockReturnValue({});
  authState.isAuthenticated = true;
  authState.token = 'token-1';
  authState.refreshToken = 'refresh-1';
  authState.user = { id: 7, username: 'creator', email: 'creator@example.com', role: 'PROBLEM_CREATOR' };
  api.getTags.mockResolvedValue([]);
  api.createProblem.mockResolvedValue(createdProblem);
  api.updateProblem.mockResolvedValue({} as unknown as ProblemType);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// vitest runs with globals: false, so @testing-library auto-cleanup never
// registers on its own; unmount explicitly or the DOM leaks across tests.
afterEach(() => {
  cleanup();
});

describe('ProblemFormPage (create mode)', () => {
  it('renders the create form and loads tags into checkboxes', async () => {
    api.getTags.mockResolvedValue(TAGS);
    render(<ProblemFormPage />);

    expect(await screen.findByText('Create New Problem')).toBeInTheDocument();
    // Localized tag label, en-only fallback label, and slug fallback (no en key).
    expect(screen.getByLabelText('DP')).toBeInTheDocument();
    expect(screen.getByLabelText('Math')).toBeInTheDocument();
    expect(screen.getByLabelText('ro-only')).toBeInTheDocument();
    expect(api.getTags).toHaveBeenCalledTimes(1);
  });

  it('logs to console when tag loading fails but still renders', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.getTags.mockRejectedValue(new Error('tags down'));
    render(<ProblemFormPage />);

    expect(await screen.findByText('Create New Problem')).toBeInTheDocument();
    await waitFor(() => expect(errSpy).toHaveBeenCalledWith('Failed to fetch tags', expect.any(Error)));
  });

  it('toggles selected tags into the payload', async () => {
    api.getTags.mockResolvedValue(TAGS);
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');

    fireEvent.click(screen.getByLabelText('DP'));
    fireEvent.click(screen.getByLabelText('DP')); // uncheck again
    fireEvent.click(screen.getByLabelText('Math'));
    fillRequiredCreateFields();
    submitForm();

    await waitFor(() => expect(api.createProblem).toHaveBeenCalled());
    expect(api.createProblem).toHaveBeenCalledWith(
      expect.objectContaining({ tag_ids: [2] })
    );
  });

  it('edits configuration fields and flows the sample flag into added test cases', async () => {
    api.createProblem.mockResolvedValue(createdProblem);
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');

    fireEvent.change(screen.getByLabelText('Difficulty:'), { target: { value: 'HARD' } });
    fireEvent.change(screen.getByLabelText('Time Limit (ms):'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Memory Limit (KB):'), { target: { value: '65536' } });
    fireEvent.change(screen.getByLabelText('Status:'), { target: { value: 'PENDING_APPROVAL' } });
    fireEvent.click(screen.getByLabelText('Is Sample?:'));
    fireEvent.change(screen.getByLabelText('Input Data:'), { target: { value: 'samp-in' } });
    fireEvent.change(screen.getByLabelText('Expected Output Data:'), { target: { value: 'samp-out' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));

    expect(await screen.findByText('Test Case 1 (Sample)')).toBeInTheDocument();

    fillRequiredCreateFields();
    submitForm();
    await waitFor(() => expect(api.createProblem).toHaveBeenCalled());
    expect(api.createProblem).toHaveBeenCalledWith(
      expect.objectContaining({
        difficulty: 'HARD',
        default_time_limit_ms: 500,
        default_memory_limit_kb: 65536,
        status: 'PENDING_APPROVAL',
      })
    );
    expect(api.createTestCase).toHaveBeenCalledWith(
      expect.objectContaining({ is_sample: true, input_data: 'samp-in' })
    );
  });

  it('adds and removes allowed languages via the checkboxes', async () => {
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');

    // Default [python3, cpp17]: uncheck cpp17, check java11.
    fireEvent.click(screen.getByLabelText('cpp17'));
    fireEvent.click(screen.getByLabelText('java11'));
    fillRequiredCreateFields();
    submitForm();

    await waitFor(() => expect(api.createProblem).toHaveBeenCalled());
    expect(api.createProblem).toHaveBeenCalledWith(
      expect.objectContaining({ allowed_languages: ['python3', 'java11'] })
    );
  });

  it('submits the default payload and navigates to the edit route on create', async () => {
    api.createProblem.mockResolvedValue(createdProblem);
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');
    fillRequiredCreateFields();
    submitForm();

    await waitFor(() => expect(api.createProblem).toHaveBeenCalled());
    expect(api.createProblem).toHaveBeenCalledWith(
      expect.objectContaining({
        title_i18n: { en: 'My Title', ro: 'Titlul Meu' },
        statement_i18n: { en: 'Stmt EN', ro: 'Enunț RO' },
        difficulty: 'EASY',
        default_time_limit_ms: 1000,
        default_memory_limit_kb: 262144,
        status: 'DRAFT',
        allowed_languages: ['python3', 'cpp17'],
        comparison_mode: 'LINES_STRIP_EXACT',
        float_comparison_epsilon: null,
        checker_code: null,
        checker_language: null,
        tag_ids: [],
      })
    );
    expect(await screen.findByText('Problem created successfully!')).toBeInTheDocument();
    expect(nav.push).toHaveBeenCalledWith('/problems/42/edit');
    expect(api.updateProblem).not.toHaveBeenCalled();
  });

  it('saves each local test case sequentially after create', async () => {
    api.createProblem.mockResolvedValue(createdProblem);
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');

    fireEvent.change(screen.getByLabelText('Input Data:'), { target: { value: 'tc-in-1' } });
    fireEvent.change(screen.getByLabelText('Expected Output Data:'), { target: { value: 'tc-out-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));
    fireEvent.change(screen.getByLabelText('Input Data:'), { target: { value: 'tc-in-2' } });
    fireEvent.change(screen.getByLabelText('Expected Output Data:'), { target: { value: 'tc-out-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));

    expect(await screen.findByText('Test Case 1')).toBeInTheDocument();
    expect(screen.getByText('Test Case 2')).toBeInTheDocument();

    fillRequiredCreateFields();
    submitForm();

    await waitFor(() => expect(api.createTestCase).toHaveBeenCalledTimes(2));
    expect(api.createTestCase).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ input_data: 'tc-in-1', problem: 42 })
    );
    expect(api.createTestCase).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ input_data: 'tc-in-2', problem: 42 })
    );
    expect(nav.push).toHaveBeenCalledWith('/problems/42/edit');
  });

  it('keeps navigating when a post-create test case save fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.createProblem.mockResolvedValue(createdProblem);
    api.createTestCase.mockRejectedValue(new Error('tc boom'));
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');

    fireEvent.change(screen.getByLabelText('Input Data:'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Expected Output Data:'), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));
    await screen.findByText('Test Case 1');

    fillRequiredCreateFields();
    submitForm();

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/problems/42/edit'));
    expect(errSpy).toHaveBeenCalledWith('Failed to save a test case for new problem:', expect.any(Error));
    expect(await screen.findByText('Problem created successfully!')).toBeInTheDocument();
  });

  it('skips the test case loop when the created problem has no id', async () => {
    api.createProblem.mockResolvedValue({} as ProblemType);
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');
    fillRequiredCreateFields();
    submitForm();

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/problems/undefined/edit'));
    expect(api.createTestCase).not.toHaveBeenCalled();
  });

  it('shows the API error message when create fails', async () => {
    api.createProblem.mockRejectedValue(new Error('Save failed'));
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');
    fillRequiredCreateFields();
    submitForm();

    expect(await screen.findByText('Save failed')).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('falls back to the generic message when create fails without one', async () => {
    api.createProblem.mockRejectedValue({});
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');
    fillRequiredCreateFields();
    submitForm();

    expect(await screen.findByText('Failed to save problem.')).toBeInTheDocument();
  });

  it('blocks submit with an auth error when there is no token', async () => {
    authState.token = null;
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');
    submitForm();

    expect(await screen.findByText('Authentication required.')).toBeInTheDocument();
    expect(api.createProblem).not.toHaveBeenCalled();
  });

  it('disables the submit button while saving and re-enables after', async () => {
    let resolveCreate!: (v: ProblemType) => void;
    api.createProblem.mockImplementation(
      () => new Promise<ProblemType>((res) => { resolveCreate = res; })
    );
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');
    fillRequiredCreateFields();

    const button = screen.getByRole('button', { name: 'Create Problem' });
    expect(button).toBeEnabled();
    submitForm();
    await waitFor(() => expect(button).toBeDisabled());
    expect(api.createProblem).toHaveBeenCalledTimes(1);

    await act(async () => { resolveCreate(createdProblem); });
    await waitFor(() => expect(button).toBeEnabled());
  });
});

describe('ProblemFormPage (edit mode)', () => {
  beforeEach(() => {
    nav.params.mockReturnValue({ problemId: '12' });
    api.getProblemDetail.mockResolvedValue(fullProblem);
  });

  it('shows the spinner while the problem loads, then renders the prefilled form', async () => {
    let resolveDetail!: (v: ProblemType) => void;
    api.getProblemDetail.mockImplementation(
      () => new Promise<ProblemType>((res) => { resolveDetail = res; })
    );
    // Tag checkboxes render from getTags(); problem.tags only preselects ids.
    api.getTags.mockResolvedValue([{ id: 3, name_i18n: { en: 'Greedy' }, slug: 'greedy' }]);
    render(<ProblemFormPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    await act(async () => { resolveDetail(fullProblem); });

    expect(await screen.findByText('Edit Problem')).toBeInTheDocument();
    expect((screen.getByLabelText('Title (English):') as HTMLInputElement).value).toBe('Full Problem');
    expect((screen.getByLabelText('Title (Romanian):') as HTMLInputElement).value).toBe('Problema Completă');
    expect((screen.getByLabelText('Statement (English):') as HTMLTextAreaElement).value).toBe('Statement EN');
    expect((screen.getByLabelText('Statement (Romanian):') as HTMLTextAreaElement).value).toBe('Enunț RO');
    expect((screen.getByLabelText('Difficulty:') as HTMLSelectElement).value).toBe('HARD');
    expect((screen.getByLabelText('Time Limit (ms):') as HTMLInputElement).value).toBe('2000');
    expect((screen.getByLabelText('Memory Limit (KB):') as HTMLInputElement).value).toBe('131072');
    expect((screen.getByLabelText('Status:') as HTMLSelectElement).value).toBe('PRIVATE');
    expect((screen.getByLabelText('Comparison Mode:') as HTMLSelectElement).value).toBe('CUSTOM_CHECKER');
    expect((screen.getByLabelText('java11') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('python3') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Greedy') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/checker_code/) as HTMLTextAreaElement).value).toBe('print("chk")');

    // Prefetched test cases render with the sample marker on the first one.
    expect(screen.getByText('Test Case 1 (Sample)')).toBeInTheDocument();
    expect(screen.getByText('Test Case 2')).toBeInTheDocument();
    expect(screen.getByText('in-a')).toBeInTheDocument();
    expect(screen.getByText('in-b')).toBeInTheDocument();
  });

  it('applies field defaults when the detail response is sparse', async () => {
    api.getProblemDetail.mockResolvedValue(sparseProblem);
    render(<ProblemFormPage />);

    expect(await screen.findByText('Edit Problem')).toBeInTheDocument();
    expect((screen.getByLabelText('Title (English):') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Title (Romanian):') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Statement (English):') as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText('Statement (Romanian):') as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText('Difficulty:') as HTMLSelectElement).value).toBe('EASY');
    expect((screen.getByLabelText('Time Limit (ms):') as HTMLInputElement).value).toBe('1000');
    expect((screen.getByLabelText('Memory Limit (KB):') as HTMLInputElement).value).toBe('262144');
    expect((screen.getByLabelText('Status:') as HTMLSelectElement).value).toBe('DRAFT');
    expect((screen.getByLabelText('python3') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('cpp17') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Comparison Mode:') as HTMLSelectElement).value).toBe('LINES_STRIP_EXACT');
    expect(screen.queryByText(/Test Case \d/)).not.toBeInTheDocument();
  });

  it('shows a form error when the problem fails to load', async () => {
    api.getProblemDetail.mockRejectedValue(new Error('detail down'));
    render(<ProblemFormPage />);

    expect(await screen.findByText('Failed to load problem for editing.')).toBeInTheDocument();
    expect(screen.getByText('Edit Problem')).toBeInTheDocument();
  });

  it('does not fetch the problem when authenticated without a token', async () => {
    authState.token = null;
    render(<ProblemFormPage />);

    expect(await screen.findByText('Edit Problem')).toBeInTheDocument();
    expect(api.getProblemDetail).not.toHaveBeenCalled();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('sends the prefilled payload to updateProblem and shows the success message', async () => {
    render(<ProblemFormPage />);
    await screen.findByText('Edit Problem');

    fireEvent.submit(screen.getByRole('button', { name: 'Save Changes' }).closest('form')!);

    await waitFor(() => expect(api.updateProblem).toHaveBeenCalledTimes(1));
    expect(api.updateProblem).toHaveBeenCalledWith(
      '12',
      expect.objectContaining({
        title_i18n: { en: 'Full Problem', ro: 'Problema Completă' },
        status: 'PRIVATE',
        comparison_mode: 'CUSTOM_CHECKER',
        checker_code: 'print("chk")',
        checker_language: 'cpp17',
        float_comparison_epsilon: null,
      })
    );
    expect(await screen.findByText('Problem updated successfully!')).toBeInTheDocument();
    expect(api.createProblem).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('shows the error message when update fails', async () => {
    api.updateProblem.mockRejectedValue(new Error('Cannot update'));
    render(<ProblemFormPage />);
    await screen.findByText('Edit Problem');

    fireEvent.submit(screen.getByRole('button', { name: 'Save Changes' }).closest('form')!);

    expect(await screen.findByText('Cannot update')).toBeInTheDocument();
  });

  it('persists an added test case immediately and resets the input form', async () => {
    api.createTestCase.mockResolvedValue({ id: 77, input_data: 'new-in', expected_output_data: 'new-out', is_sample: false, points: 10, order: 3 });
    render(<ProblemFormPage />);
    await screen.findByText('Edit Problem');

    fireEvent.change(screen.getByLabelText('Input Data:'), { target: { value: 'new-in' } });
    fireEvent.change(screen.getByLabelText('Expected Output Data:'), { target: { value: 'new-out' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));

    await waitFor(() => expect(api.createTestCase).toHaveBeenCalledTimes(1));
    expect(api.createTestCase).toHaveBeenCalledWith(
      expect.objectContaining({ problem: 12, input_data: 'new-in', expected_output_data: 'new-out', order: 3 })
    );
    expect(await screen.findByText('Test case added successfully!')).toBeInTheDocument();
    expect((screen.getByLabelText('Input Data:') as HTMLTextAreaElement).value).toBe('');
  });

  it('keeps the typed test case when the immediate persist fails', async () => {
    api.createTestCase.mockRejectedValue(new Error('tc persist fail'));
    render(<ProblemFormPage />);
    await screen.findByText('Edit Problem');

    fireEvent.change(screen.getByLabelText('Input Data:'), { target: { value: 'kept-in' } });
    fireEvent.change(screen.getByLabelText('Expected Output Data:'), { target: { value: 'kept-out' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));

    expect(await screen.findByText('tc persist fail')).toBeInTheDocument();
    expect((screen.getByLabelText('Input Data:') as HTMLTextAreaElement).value).toBe('kept-in');
    expect(screen.queryByText('Test Case 3')).not.toBeInTheDocument();
  });

  it('falls back to the generic message when immediate persist fails without one', async () => {
    api.createTestCase.mockRejectedValue({});
    render(<ProblemFormPage />);
    await screen.findByText('Edit Problem');

    fireEvent.change(screen.getByLabelText('Input Data:'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Expected Output Data:'), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));

    expect(await screen.findByText('Failed to add test case.')).toBeInTheDocument();
  });

  it('deletes a persisted test case on remove', async () => {
    render(<ProblemFormPage />);
    await screen.findByText('Edit Problem');

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

    await waitFor(() => expect(api.deleteTestCase).toHaveBeenCalledWith(51));
    expect(await screen.findByText('Test case removed successfully!')).toBeInTheDocument();
    expect(screen.queryByText('in-a')).not.toBeInTheDocument();
    expect(screen.getByText('in-b')).toBeInTheDocument();
  });

  it('shows the error message when delete fails, and the generic fallback when absent', async () => {
    api.deleteTestCase.mockRejectedValueOnce(new Error('del fail'));
    api.deleteTestCase.mockRejectedValueOnce({});
    render(<ProblemFormPage />);
    await screen.findByText('Edit Problem');

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(await screen.findByText('del fail')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(await screen.findByText('Failed to remove test case.')).toBeInTheDocument();
  });
});

describe('ProblemFormPage (test case input validation and auth)', () => {
  it('toasts an error and adds nothing when input or output is empty', async () => {
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');

    fireEvent.change(screen.getByLabelText('Input Data:'), { target: { value: 'only-input' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));

    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Test case input and output cannot be empty.'));
    expect(screen.queryByText(/Test Case \d/)).not.toBeInTheDocument();
  });

  it('rejects adding a test case without a token', async () => {
    authState.token = null;
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');

    fireEvent.change(screen.getByLabelText('Input Data:'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Expected Output Data:'), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));

    expect(await screen.findByText('Authentication required.')).toBeInTheDocument();
    expect(screen.queryByText(/Test Case \d/)).not.toBeInTheDocument();
  });

  it('coerces a non-numeric points value to 0', async () => {
    api.createProblem.mockResolvedValue(createdProblem);
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');

    fireEvent.change(screen.getByLabelText('Points:'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText('Input Data:'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Expected Output Data:'), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));
    await screen.findByText('Test Case 1');

    fillRequiredCreateFields();
    submitForm();
    await waitFor(() => expect(api.createTestCase).toHaveBeenCalled());
    expect(api.createTestCase).toHaveBeenCalledWith(expect.objectContaining({ points: 0 }));
  });

  it('removes a local test case without calling the API, and blocks removal without a token', async () => {
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');

    fireEvent.change(screen.getByLabelText('Input Data:'), { target: { value: 'local-in' } });
    fireEvent.change(screen.getByLabelText('Expected Output Data:'), { target: { value: 'local-out' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));
    await screen.findByText('Test Case 1');

    // Token disappears between add and remove (logout mid-session).
    authState.token = null;
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Authentication required.')).toBeInTheDocument();
    expect(api.deleteTestCase).not.toHaveBeenCalled();
    expect(screen.getByText('local-in')).toBeInTheDocument();

    authState.token = 'token-1';
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByText('local-in')).not.toBeInTheDocument());
    expect(api.deleteTestCase).not.toHaveBeenCalled();
  });
});

describe('ProblemFormPage (advanced configuration branches)', () => {
  it('shows the epsilon field only for FLOAT_PRECISE and sends the epsilon', async () => {
    api.createProblem.mockResolvedValue(createdProblem);
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');

    expect(screen.queryByLabelText(/float_epsilon/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Comparison Mode:'), { target: { value: 'FLOAT_PRECISE' } });

    const epsilon = await screen.findByLabelText(/float_epsilon/);
    expect(epsilon).toBeInTheDocument();
    // Default 1e-6 is shown; replace it and submit.
    fireEvent.change(epsilon, { target: { value: '0.25' } });
    fillRequiredCreateFields();
    submitForm();

    await waitFor(() => expect(api.createProblem).toHaveBeenCalled());
    expect(api.createProblem).toHaveBeenCalledWith(expect.objectContaining({ float_comparison_epsilon: 0.25 }));
  });

  it('sends a null epsilon when the field is cleared', async () => {
    api.createProblem.mockResolvedValue(createdProblem);
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');

    fireEvent.change(screen.getByLabelText('Comparison Mode:'), { target: { value: 'FLOAT_PRECISE' } });
    const epsilon = await screen.findByLabelText(/float_epsilon/);
    fireEvent.change(epsilon, { target: { value: '' } });
    fillRequiredCreateFields();
    submitForm();

    await waitFor(() => expect(api.createProblem).toHaveBeenCalled());
    expect(api.createProblem).toHaveBeenCalledWith(expect.objectContaining({ float_comparison_epsilon: null }));
  });

  it('prefills a null epsilon as an empty field', async () => {
    nav.params.mockReturnValue({ problemId: '14' });
    api.getProblemDetail.mockResolvedValue({
      id: 14,
      title_i18n: { en: 'Eps' },
      difficulty: 'EASY',
      status: 'DRAFT',
      comparison_mode: 'FLOAT_PRECISE',
      float_comparison_epsilon: null,
    } as unknown as ProblemType);
    render(<ProblemFormPage />);

    const epsilon = await screen.findByLabelText(/float_epsilon/);
    expect((epsilon as HTMLInputElement).value).toBe('');
  });

  it('shows checker fields only for CUSTOM_CHECKER and sends them', async () => {
    api.createProblem.mockResolvedValue(createdProblem);
    render(<ProblemFormPage />);
    await screen.findByText('Create New Problem');

    expect(screen.queryByLabelText(/checker_code/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Comparison Mode:'), { target: { value: 'CUSTOM_CHECKER' } });

    expect(await screen.findByLabelText(/checker_code/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/checker_language/), { target: { value: 'python3' } });
    fireEvent.change(screen.getByLabelText(/checker_code/), { target: { value: 'def check(): pass' } });
    fillRequiredCreateFields();
    submitForm();

    await waitFor(() => expect(api.createProblem).toHaveBeenCalled());
    expect(api.createProblem).toHaveBeenCalledWith(
      expect.objectContaining({ checker_code: 'def check(): pass', checker_language: 'python3' })
    );

    // Clearing both sends nulls (the `|| null` onChange branches).
    fireEvent.change(screen.getByLabelText(/checker_language/), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/checker_code/), { target: { value: '' } });
    submitForm();
    await waitFor(() => expect(api.createProblem).toHaveBeenCalledTimes(2));
    expect(api.createProblem).toHaveBeenLastCalledWith(
      expect.objectContaining({ checker_code: null, checker_language: null })
    );
  });
});
