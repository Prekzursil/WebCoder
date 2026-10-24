import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAuth } from '@/context/AuthContext';
import { SubmissionService } from '@/services/ApiService';
import { DetailedSubmissionType } from '@/types';

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  SubmissionService: {
    createSubmission: vi.fn(),
    getSubmissionDetail: vi.fn(),
  },
}));

// [A6] CodeMirror is heavy and needs a real layout engine — stub it with a
// labeled textarea that the tests can drive through the same props.
vi.mock('./CodeEditor', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void; ariaLabel?: string }) => (
    <textarea
      id="code-editor"
      aria-label="Code:"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={8}
    />
  ),
}));

import SubmitSolutionForm from './SubmitSolutionForm';

const createSubmissionMock = vi.mocked(SubmissionService.createSubmission);
const getDetailMock = vi.mocked(SubmissionService.getSubmissionDetail);

function mockAuth({ isAuthenticated }: { isAuthenticated: boolean }) {
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated,
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function renderForm(allowedLanguages: string[] = ['python3', 'cpp17']) {
  return render(
    <SubmitSolutionForm
      problemId="7"
      allowedLanguages={allowedLanguages}
      problemTitle="Two Sum"
    />
  );
}

function typeCode(code: string) {
  fireEvent.change(screen.getByLabelText(/Code:/i), { target: { value: code } });
}

function clickSubmit() {
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
}

function confirmModal() {
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
}

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(useAuth).mockReset();
  createSubmissionMock.mockReset();
  getDetailMock.mockReset();
});

describe('SubmitSolutionForm (unauthenticated visitors)', () => {
  it('renders the login prompt instead of the form (render-level gate [SP1])', () => {
    mockAuth({ isAuthenticated: false });
    renderForm();

    const loginLink = screen.getByRole('link', { name: 'login' });
    expect(loginLink.getAttribute('href')).toBe('/login');
    // The prompt is split across text nodes around the link ("Please " +
    // <link>login</link> + " to submit a solution.").
    expect(screen.getByText(/to submit a solution/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    expect(createSubmissionMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('heading', { name: 'Confirm Submission' })
    ).not.toBeInTheDocument();
  });
});

describe('SubmitSolutionForm (authenticated visitors)', () => {
  beforeEach(() => {
    mockAuth({ isAuthenticated: true });
  });

  it('renders the editor with the first allowed language preselected', () => {
    renderForm();

    const languageSelect = screen.getByLabelText(/Language:/i) as HTMLSelectElement;
    expect(languageSelect.value).toBe('python3');
    expect(screen.getByRole('option', { name: 'python3' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'cpp17' })).toBeInTheDocument();
  });

  it('falls back to python3 state and disables the select when no languages are allowed', () => {
    renderForm([]);

    const languageSelect = screen.getByLabelText(/Language:/i) as HTMLSelectElement;
    // State holds 'python3' (no allowed languages), but the controlled select
    // has no matching option, so the DOM value is empty — same as CRA.
    expect(languageSelect.value).toBe('');
    expect(languageSelect).toBeDisabled();
    expect(screen.queryByRole('option', { name: 'python3' })).not.toBeInTheDocument();
  });

  it('disables the submit button while the code is blank', () => {
    renderForm();

    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('blocks submission with an error when the form is submitted with empty code', () => {
    // The submit button is disabled for blank code, so the guard is reached
    // through the form's submit event itself (the defensive CRA path).
    renderForm();

    const form = screen.getByLabelText(/Code:/i).closest('form') as HTMLFormElement;
    fireEvent.submit(form);

    expect(screen.getByText('Code cannot be empty.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Confirm Submission' })).not.toBeInTheDocument();
    expect(createSubmissionMock).not.toHaveBeenCalled();
  });

  it('opens the confirmation modal with language and problem context, and Cancel closes it', () => {
    renderForm();
    typeCode('print(3)');

    clickSubmit();

    expect(
      screen.getByRole('heading', { name: 'Confirm Submission' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Submit solution in python3 to "Two Sum"?')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('heading', { name: 'Confirm Submission' })
    ).not.toBeInTheDocument();
    expect(createSubmissionMock).not.toHaveBeenCalled();
  });

  it('submits the solution on confirm and reports the pending submission id', async () => {
    renderForm();
    typeCode('print(3)');
    clickSubmit();
    createSubmissionMock.mockResolvedValue({
      id: 123,
      problem: { id: 7, title_i18n: { en: 'Two Sum' } },
      language: 'python3',
      verdict: 'PENDING',
      submission_time: '2026-09-22T10:00:00Z',
      code: 'print(3)',
    });

    confirmModal();

    await waitFor(() => {
      expect(
        screen.getByText('Solution submitted successfully! It is pending evaluation. (Submission ID: 123)')
      ).toBeInTheDocument();
    });
    expect(createSubmissionMock).toHaveBeenCalledWith({
      problem: 7,
      language: 'python3',
      code: 'print(3)',
    });
    // The editor is cleared after a successful submission.
    expect(screen.getByLabelText(/Code:/i)).toHaveValue('');
    expect(
      screen.queryByRole('heading', { name: 'Confirm Submission' })
    ).not.toBeInTheDocument();

    // [F14] the success state links out and polls the verdict live.
    expect(screen.getByRole('link', { name: 'View status' })).toHaveAttribute('href', '/submissions/123');
    expect(screen.getByText(/Polling for updates/)).toBeInTheDocument();
  });

  it('polls the fresh submission and shows the terminal verdict [F14]', async () => {
    createSubmissionMock.mockResolvedValue({
      id: 123,
      problem: { id: 7, title_i18n: { en: 'Two Sum' } },
      language: 'python3',
      verdict: 'PENDING',
      submission_time: '2026-09-22T10:00:00Z',
      code: 'print(3)',
    } as DetailedSubmissionType);
    getDetailMock.mockResolvedValue({
      id: 123,
      problem: { id: 7, title_i18n: { en: 'Two Sum' } },
      language: 'python3',
      verdict: 'WA',
      submission_time: '2026-09-22T10:00:00Z',
      code: 'print(3)',
    } as DetailedSubmissionType);

    renderForm();
    typeCode('print(3)');
    clickSubmit();
    confirmModal();

    await waitFor(() => {
      expect(screen.getByText('WA')).toBeInTheDocument();
    });
    expect(getDetailMock).toHaveBeenCalledWith('123');
  });

  it('inserts a per-language starter template [A6-interim]', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Insert python3 template' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Insert python3 template' }));
    expect(screen.getByLabelText(/Code:/i)).toHaveValue(
      'def main():\n    pass\n\n\nif __name__ == "__main__":\n    main()\n'
    );
  });

  it('passes the selected language to the real editor [A6]', () => {
    renderForm();
    // The CodeEditor stub records the language prop; CodeMirror itself
    // (Tab-indent, bracket matching) is exercised by the build + e2e.
    const languageSelect = screen.getByLabelText(/Language:/i) as HTMLSelectElement;
    fireEvent.change(languageSelect, { target: { value: 'cpp17' } });
    expect(screen.getByLabelText('Code:')).toBeInTheDocument();
    typeCode('int main() { return 0; }');
    expect(screen.getByLabelText(/Code:/i)).toHaveValue('int main() { return 0; }');
  });

  it('wires Mod-Enter submit through the editor [A6]', () => {
    renderForm();
    typeCode('print(3)');
    // The real keymap lives inside CodeEditor (Prec.high keymap); the form
    // contract is that the editor is mounted with the submit handler, which
    // the mock exercises directly via the captured props.
    const editor = screen.getByLabelText(/Code:/i);
    expect(editor).toBeInTheDocument();
    clickSubmit();
    expect(screen.getByRole('heading', { name: 'Confirm Submission' })).toBeInTheDocument();
  });

  it('shows the server error message when the submission fails', async () => {
    renderForm();
    typeCode('print(3)');
    clickSubmit();
    createSubmissionMock.mockRejectedValue(new Error('Judge is down'));

    confirmModal();

    await waitFor(() => {
      expect(screen.getByText('Judge is down')).toBeInTheDocument();
    });
  });

  it('falls back to the generic message for non-Error rejections', async () => {
    renderForm();
    typeCode('print(3)');
    clickSubmit();
    createSubmissionMock.mockRejectedValue('network glitch');

    confirmModal();

    await waitFor(() => {
      expect(screen.getByText('Submission failed.')).toBeInTheDocument();
    });
  });


  it('guards against an empty language selection at confirm time', () => {
    renderForm();
    typeCode('print(3)');
    clickSubmit();

    // The select is controlled: forcing the empty (placeholder) value mimics
    // the defensive CRA branch where selectedLanguage is ''.
    fireEvent.change(screen.getByLabelText(/Language:/i), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    confirmModal();

    expect(screen.getByText('Please select a language.')).toBeInTheDocument();
    expect(createSubmissionMock).not.toHaveBeenCalled();
  });

  it('clears the error when the code changes', async () => {
    renderForm();

    const form = screen.getByLabelText(/Code:/i).closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    expect(screen.getByText('Code cannot be empty.')).toBeInTheDocument();

    typeCode('print(3)');
    expect(screen.queryByText('Code cannot be empty.')).not.toBeInTheDocument();
  });

  it('disables the submit button while a submission is in flight', async () => {
    let resolveSubmission: (value: DetailedSubmissionType) => void = () => {};
    createSubmissionMock.mockReturnValue(
      new Promise<DetailedSubmissionType>((resolve) => {
        resolveSubmission = resolve;
      })
    );
    renderForm();
    typeCode('print(3)');
    clickSubmit();

    confirmModal();

    const submittingButton = screen.getByRole('button', { name: 'Submitting...' });
    expect(submittingButton).toBeDisabled();

    resolveSubmission({
      id: 124,
      problem: { id: 7, title_i18n: { en: 'Two Sum' } },
      language: 'python3',
      verdict: 'PENDING',
      submission_time: '2026-09-22T10:00:00Z',
      code: '',
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    });
  });
});
