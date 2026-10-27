import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ClassDetailPage from './page';
import type { User } from '@/types';

// Class detail tests (Wave B EDU-1/EDU-2 UI): roster + teme list for
// members; the join code renders only for the owning teacher.

const api = vi.hoisted(() => ({
  getClass: vi.fn(),
  getMembers: vi.fn(),
  getAssignments: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  ClassroomService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 1, username: 'bob', email: 'b@x.com', role: 'BASIC_USER' } as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ classId: '5' }),
}));

const CLASSROOM = {
  id: 5,
  name: 'IX-A',
  school: 'Liceul X',
  is_open: true,
  created_at: '2026-10-01T00:00:00Z',
  teacher_username: 'teacher',
  member_count: 2,
  assignment_count: 1,
  is_owner: false,
};

const ASSIGNMENT = {
  id: 3,
  classroom: 5,
  classroom_name: 'IX-A',
  title_i18n: { en: 'Tema 1 — loops', ro: 'Tema 1 — bucle' },
  description: '',
  available_from: '2026-10-20T00:00:00Z',
  due_at: '2999-01-01T00:00:00Z',
  late_until: null,
  is_exam: false,
  state: 'OPEN',
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getClass.mockResolvedValue(CLASSROOM);
  api.getMembers.mockRejectedValue(new Error('forbidden'));
  api.getAssignments.mockResolvedValue({ count: 1, next: null, previous: null, results: [ASSIGNMENT] });
});

afterEach(cleanup);

describe('ClassDetailPage', () => {
  it('member view: teme list, no roster (403), no join code', async () => {
    render(<ClassDetailPage />);
    expect(await screen.findByRole('heading', { name: 'IX-A' })).toBeInTheDocument();
    const tema = await screen.findByRole('link', { name: /Tema 1/ });
    expect(tema).toHaveAttribute('href', '/classes/assignments/3');
    expect(screen.queryByTestId('class-join-code')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /Roster/ })).not.toBeInTheDocument();
  });

  it('owner view: roster + join code render', async () => {
    api.getClass.mockResolvedValue({ ...CLASSROOM, is_owner: true, join_code: 'ABCD1234' });
    api.getMembers.mockResolvedValue([
      { id: 9, username: 'bob', joined_at: '2026-10-02T00:00:00Z' },
    ]);
    render(<ClassDetailPage />);

    expect(await screen.findByTestId('class-join-code')).toHaveTextContent('ABCD1234');
    expect(await screen.findByText('bob')).toBeInTheDocument();
  });
});
