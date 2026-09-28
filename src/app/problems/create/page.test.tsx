import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import CreateProblemPage from './page';

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
  usePathname: () => '/problems/create',
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

beforeEach(() => {
  vi.clearAllMocks();
  nav.params.mockReturnValue({});
  authState.isAuthenticated = true;
  authState.token = 'token-1';
  authState.refreshToken = 'refresh-1';
  authState.user = { id: 7, username: 'creator', email: 'creator@example.com', role: 'PROBLEM_CREATOR' };
  api.getTags.mockResolvedValue([]);
});

// vitest runs with globals: false, so @testing-library auto-cleanup never
// registers on its own; unmount explicitly or the DOM leaks across tests.
afterEach(() => {
  cleanup();
});

describe('Create problem route (/problems/create)', () => {
  it('renders the create form for an authorized problem creator', async () => {
    render(<CreateProblemPage />);

    expect(await screen.findByText('Create New Problem')).toBeInTheDocument();
    expect(api.getTags).toHaveBeenCalledTimes(1);
    // Create mode: no problem detail fetch, create-style submit button.
    expect(api.getProblemDetail).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create Problem' })).toBeInTheDocument();
  });

  it('redirects to /login and renders nothing when there is no user', async () => {
    authState.user = null;
    render(<CreateProblemPage />);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('Create New Problem')).not.toBeInTheDocument();
    expect(api.getTags).not.toHaveBeenCalled();
  });

  it('redirects to / when the role is not authorized', async () => {
    authState.user = { id: 8, username: 'basic', email: 'b@example.com', role: 'BASIC_USER' };
    render(<CreateProblemPage />);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByText('Create New Problem')).not.toBeInTheDocument();
  });
});
