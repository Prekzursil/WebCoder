import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import AssignmentDetailPage from './page';
import type { User } from '@/types';

// Temă detail tests (Wave B EDU-2/5/6 UI): students see the problem set;
// the owning teacher additionally sees the EDU-5 grid with best scores +
// late flags and the EDU-6 CSV export link.

const api = vi.hoisted(() => ({
  getAssignment: vi.fn(),
  getGrid: vi.fn(),
  exportCsvUrl: (id: number | string) => `/api/v1/classroom/assignments/${id}/export/`,
}));

vi.mock('@/services/ApiService', () => ({
  ClassroomService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 2, username: 'teacher', email: 't@x.com', role: 'TEACHER' } as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ assignmentId: '3' }),
}));

const ASSIGNMENT = {
  id: 3,
  classroom: 5,
  classroom_name: 'IX-A',
  title_i18n: { en: 'Tema 1 — loops', ro: 'Tema 1 — bucle' },
  description: 'Practice for loops.',
  available_from: '2026-10-20T00:00:00Z',
  due_at: '2999-01-01T00:00:00Z',
  late_until: null,
  is_exam: false,
  state: 'OPEN',
  assignment_problems: [
    { id: 11, problem: 101, problem_title: { en: 'Sum Two', ro: 'Suma a două' }, problem_difficulty: 'EASY', order: 0, label: 'A', points: 100 },
  ],
};

const GRID = {
  assignment_id: 3,
  students: [
    { id: 10, username: 'alice' },
    { id: 11, username: 'bob' },
  ],
  problems: [{ id: 11, problem_id: 101, label: 'A', points: 100, title_i18n: { en: 'Sum Two' } }],
  cells: {
    '10:101': { best_score: 100, attempts: 1, last_attempt_at: '2026-10-21T00:00:00Z', verdict: 'AC', late: false },
    '11:101': { best_score: 55, attempts: 2, last_attempt_at: '2026-10-22T00:00:00Z', verdict: 'WA', late: true },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getAssignment.mockResolvedValue(ASSIGNMENT);
});

afterEach(cleanup);

describe('AssignmentDetailPage', () => {
  it('teacher: problem set + progress grid + CSV export link', async () => {
    api.getGrid.mockResolvedValue(GRID);
    render(<AssignmentDetailPage />);

    expect(await screen.findByRole('heading', { name: /Tema 1/ })).toBeInTheDocument();
    expect(await screen.findByTestId('grid-row-alice')).toHaveTextContent('100');
    expect(screen.getByTestId('grid-row-bob')).toHaveTextContent('55');
    // Late cell flagged; the CSV export points at the backend download.
    expect(screen.getByText(/⏰/)).toBeInTheDocument();
    const csv = screen.getByTestId('gradebook-csv');
    expect(csv.getAttribute('href')).toContain('/classroom/assignments/3/export/');
  });

  it('student: problem set renders, grid hidden on 403', async () => {
    api.getGrid.mockRejectedValue(new Error('Only the teacher can view the progress grid.'));
    render(<AssignmentDetailPage />);

    expect(await screen.findByRole('link', { name: 'Sum Two' })).toHaveAttribute(
      'href',
      '/problems/101'
    );
    await waitFor(() =>
      expect(screen.queryByTestId('gradebook-csv')).not.toBeInTheDocument()
    );
  });

  it('error state surfaces the message', async () => {
    api.getAssignment.mockRejectedValue(new Error('Not found.'));
    render(<AssignmentDetailPage />);
    expect(await screen.findByText('Not found.')).toBeInTheDocument();
  });
});

