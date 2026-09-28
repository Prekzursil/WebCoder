import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import type { ProblemType } from '@/types';
import EditProblemPage from './page';

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  token: 'token-1' as string | null,
  refreshToken: 'refresh-1' as string | null,
  user: {
    id: 7,
    username: 'verifier',
    email: 'verifier@example.com',
    role: 'PROBLEM_VERIFIER',
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
  usePathname: () => '/problems/12/edit',
}));

const api = vi.hoisted(() => ({
  getTags: vi.fn(),
  getProblemDetail: vi.fn(),
  createProblem: vi.fn(),
  updateProblem: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  ProblemService: {
    getTags: api.getTags,
    getProblemDetail: api.getProblemDetail,
    createProblem: api.createProblem,
    updateProblem: api.updateProblem,
  },
  TestCaseService: {
    createTestCase: vi.fn(),
    deleteTestCase: vi.fn(),
  },
}));

const DETAIL = {
  id: 12,
  title_i18n: { en: 'Edit Me', ro: 'Editează-mă' },
  difficulty: 'EASY',
  status: 'DRAFT',
} as unknown as ProblemType;

beforeEach(() => {
  vi.clearAllMocks();
  nav.params.mockReturnValue({ problemId: '12' });
  authState.isAuthenticated = true;
  authState.token = 'token-1';
  authState.refreshToken = 'refresh-1';
  authState.user = { id: 7, username: 'verifier', email: 'verifier@example.com', role: 'PROBLEM_VERIFIER' };
  api.getTags.mockResolvedValue([]);
  api.getProblemDetail.mockResolvedValue(DETAIL);
});

// vitest runs with globals: false, so @testing-library auto-cleanup never
// registers on its own; unmount explicitly or the DOM leaks across tests.
afterEach(() => {
  cleanup();
});

describe('Edit problem route (/problems/[problemId]/edit)', () => {
  it('renders the edit form prefetched from the route param', async () => {
    render(<EditProblemPage />);

    expect(await screen.findByText('Edit Problem')).toBeInTheDocument();
    expect(api.getProblemDetail).toHaveBeenCalledWith('12');
    expect((await screen.findByLabelText('Title (English):') as HTMLInputElement).value).toBe('Edit Me');
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
  });

  it('redirects to /login and skips data loading when there is no user', async () => {
    authState.user = null;
    render(<EditProblemPage />);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('Edit Problem')).not.toBeInTheDocument();
    expect(api.getProblemDetail).not.toHaveBeenCalled();
    expect(api.getTags).not.toHaveBeenCalled();
  });
});
