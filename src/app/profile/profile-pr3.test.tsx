import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import IdentityCard from './IdentityCard';
import TagProfilePanel from './TagProfilePanel';
import PrintButton from '../problems/[problemId]/PrintButton';
import SolutionsDiffPanel from '../classes/assignments/[assignmentId]/SolutionsDiffPanel';
import NewAssignmentForm from '../classes/[classId]/NewAssignmentForm';
import type { User } from '@/types';

// Parity-audit bundle 2: RO-3 identity card, RAT-7 tag profile + practice
// next, UXP-3 print route, JDG-13 solutions diff, EDU-2 temă authoring.

const api = vi.hoisted(() => ({
  updateMe: vi.fn(),
  getAssignmentSolutionsJson: vi.fn(),
  createAssignment: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  AuthService: api,
  ClassroomService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: {
      id: 7,
      username: 'me',
      email: 'm@x.com',
      role: 'BASIC',
      county: 'Cluj',
      school: '',
    } as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
  AuthContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    Consumer: ({ children }: { children: (value: unknown) => React.ReactNode }) =>
      children(mocks.auth),
    _currentValue: mocks.auth,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('IdentityCard (RO-3)', () => {
  it('saves county/school + the minor flag through PATCH /users/me/', async () => {
    api.updateMe.mockResolvedValue({ ...mocks.auth.user, county: 'Cluj', is_minor: true });
    render(<IdentityCard />);
    fireEvent.change(screen.getByTestId('identity-county'), {
      target: { value: 'Cluj' },
    });
    fireEvent.click(screen.getByTestId('identity-minor'));
    fireEvent.click(screen.getByTestId('identity-save'));
    await waitFor(() =>
      expect(api.updateMe).toHaveBeenCalledWith({
        county: 'Cluj',
        school: '',
        isMinor: true,
      })
    );
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeTruthy());
  });

  it('shows the error line when the save fails', async () => {
    api.updateMe.mockRejectedValue(new Error('nope'));
    render(<IdentityCard />);
    fireEvent.click(screen.getByTestId('identity-save'));
    await waitFor(() => expect(screen.getByText(/could not save/i)).toBeTruthy());
  });

  it('renders nothing when signed out', () => {
    mocks.auth.isAuthenticated = false;
    mocks.auth.user = null;
    const { container } = render(<IdentityCard />);
    expect(container).toBeEmptyDOMElement();
    mocks.auth.isAuthenticated = true;
    mocks.auth.user = {
      id: 7, username: 'me', email: 'm@x.com', role: 'BASIC', county: '', school: '',
    };
  });
});

describe('TagProfilePanel (RAT-7)', () => {
  it('renders covered bars + the practice-next strip', () => {
    render(
      <TagProfilePanel
        profile={{
          tags: [
            { tag: 'arrays', solved: 3, attempted: 4, covered: true, points: 5 },
            { tag: 'dp', solved: 0, attempted: 1, covered: false, points: 0 },
          ],
          practice_next: [
            { id: 2, title_i18n: { en: 'Longest Substring' }, difficulty: 'MEDIUM', tags: ['strings'] },
          ],
        }}
      />
    );
    expect(screen.getByTestId('tag-row-arrays')).toBeTruthy();
    // Uncovered tags render dimmed but honest.
    expect(screen.getByTestId('tag-row-dp')).toBeTruthy();
    expect(screen.getByTestId('practice-next').textContent).toContain(
      'Longest Substring'
    );
  });

  it('renders nothing without a profile', () => {
    const { container } = render(<TagProfilePanel profile={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PrintButton (UXP-3)', () => {
  it('calls window.print on click', () => {
    const spy = vi.fn();
    vi.stubGlobal('print', spy);
    render(<PrintButton />);
    fireEvent.click(screen.getByTestId('print-statement'));
    expect(spy).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('SolutionsDiffPanel (JDG-13)', () => {
  it('shows the locked hint when the teacher gate refuses', async () => {
    api.getAssignmentSolutionsJson.mockRejectedValue(new Error('403'));
    render(<SolutionsDiffPanel assignmentId={1} />);
    await waitFor(() =>
      expect(screen.getByText(/only the teacher can compare/i)).toBeTruthy()
    );
  });

  it('renders two selected solutions side by side', async () => {
    api.getAssignmentSolutionsJson.mockResolvedValue({
      count: 2,
      results: [
        {
          id: 101, username: 'a', problem_id: 1, verdict: 'AC', score: 100,
          language: 'python3', submission_time: '2026-10-25T10:00:00Z',
          code: 'print(1)',
        },
        {
          id: 102, username: 'b', problem_id: 1, verdict: 'AC', score: 100,
          language: 'python3', submission_time: '2026-10-25T10:05:00Z',
          code: 'print(2)',
        },
      ],
    });
    render(<SolutionsDiffPanel assignmentId={1} />);
    fireEvent.change(await screen.findByTestId('diff-left'), { target: { value: '101' } });
    fireEvent.change(screen.getByTestId('diff-right'), { target: { value: '102' } });
    const columns = screen.getByTestId('diff-columns');
    expect(columns.textContent).toContain('print(1)');
    expect(columns.textContent).toContain('print(2)');
  });
});

describe('NewAssignmentForm (EDU-2)', () => {
  it('creates a problems temă with the parsed id:points list', async () => {
    api.createAssignment.mockResolvedValue({ id: 9 });
    const onCreated = vi.fn();
    render(<NewAssignmentForm classroomId={4} onCreated={onCreated} />);
    fireEvent.click(screen.getByTestId('new-assignment-open'));
    fireEvent.change(screen.getByTestId('tema-title'), { target: { value: 'HW1' } });
    fireEvent.change(screen.getByLabelText(/available from/i), {
      target: { value: '2026-11-01T09:00' },
    });
    fireEvent.change(screen.getByLabelText(/due at/i), {
      target: { value: '2026-11-08T23:59' },
    });
    fireEvent.change(screen.getByTestId('tema-problems'), {
      target: { value: '12: 30\n13' },
    });
    fireEvent.click(screen.getByTestId('tema-submit'));
    await waitFor(() => expect(api.createAssignment).toHaveBeenCalled());
    const payload = api.createAssignment.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.classroom).toBe(4);
    expect(payload.kind).toBe('PROBLEMS');
    expect(payload.problems).toEqual([
      { problem: 12, points: 30 },
      { problem: 13, points: 100 },
    ]);
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it('rejects a malformed problem list before any request', async () => {
    render(<NewAssignmentForm classroomId={4} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByTestId('new-assignment-open'));
    fireEvent.change(screen.getByTestId('tema-title'), { target: { value: 'HW1' } });
    fireEvent.change(screen.getByLabelText(/available from/i), {
      target: { value: '2026-11-01T09:00' },
    });
    fireEvent.change(screen.getByLabelText(/due at/i), {
      target: { value: '2026-11-08T23:59' },
    });
    fireEvent.change(screen.getByTestId('tema-problems'), {
      target: { value: 'not-an-id' },
    });
    fireEvent.click(screen.getByTestId('tema-submit'));
    // The error message (the label also matches the loose pattern).
    expect(screen.getByRole('alert').textContent).toMatch(/id: points/i);
    expect(api.createAssignment).not.toHaveBeenCalled();
  });
});
