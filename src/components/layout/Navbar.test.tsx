import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import i18n from '@/i18n';
import type { User } from '@/types';
import Navbar from './Navbar';

// Navbar tests: auth-driven link matrix (all four roles), active-link styling
// (exact + prefix match), the pathname undefined -> '/' fallback, logout
// navigation, and the EN/RO language switcher. i18n runs for real.

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: false,
    token: null as string | null,
    refreshToken: null as string | null,
    user: null as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
  pathname: '/' as string | undefined,
  push: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));

const mkUser = (role: User['role']): User => ({ id: 1, username: 'tester', email: 't@example.com', role });

function setAuth(authenticated: boolean, user: User | null = null) {
  mocks.auth.isAuthenticated = authenticated;
  mocks.auth.user = user;
  mocks.auth.token = authenticated ? 'tok' : null;
}

const ACTIVE_COLOR = 'rgb(56, 189, 248)'; // #38bdf8 (accent)
const INACTIVE_COLOR = 'rgba(255, 255, 255, 0.7)'; // muted on dark

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.pathname = '/';
  setAuth(false, null);
  await i18n.changeLanguage('en');
});

afterEach(cleanup);

describe('Navbar link matrix by role', () => {
  it('renders only public links when anonymous', () => {
    setAuth(false, null);
    render(<Navbar />);
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Problems' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Register' })).toBeInTheDocument();
    expect(screen.queryByText('My Submissions')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create Problem' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Verification Queue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
    expect(screen.queryByText('tester')).not.toBeInTheDocument();
  });

  it('shows the BASIC_USER session links but no privileged links', () => {
    setAuth(true, mkUser('BASIC_USER'));
    render(<Navbar />);
    expect(screen.getByRole('link', { name: 'My Submissions' })).toHaveAttribute('href', '/my-submissions');
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create Problem' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My Problems' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Verification Queue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin Dashboard' })).not.toBeInTheDocument();
    expect(screen.getByText('tester')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument();
  });

  it('falls back to "User" in the welcome when authenticated without a user object', () => {
    setAuth(true, null);
    render(<Navbar />);
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create Problem' })).not.toBeInTheDocument();
  });

  it('adds creator links for PROBLEM_CREATOR', () => {
    setAuth(true, mkUser('PROBLEM_CREATOR'));
    render(<Navbar />);
    expect(screen.getByRole('link', { name: 'Create Problem' })).toHaveAttribute('href', '/problems/create');
    expect(screen.getByRole('link', { name: 'My Problems' })).toHaveAttribute('href', '/my-created-problems');
    expect(screen.queryByRole('link', { name: 'Verification Queue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin Dashboard' })).not.toBeInTheDocument();
  });

  it('adds creator + queue links for PROBLEM_VERIFIER but not the admin dashboard', () => {
    setAuth(true, mkUser('PROBLEM_VERIFIER'));
    render(<Navbar />);
    expect(screen.getByRole('link', { name: 'Create Problem' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Problems' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Verification Queue' })).toHaveAttribute('href', '/admin/problem-queue');
    expect(screen.queryByRole('link', { name: 'Admin Dashboard' })).not.toBeInTheDocument();
  });

  it('shows every link for ADMIN', () => {
    setAuth(true, mkUser('ADMIN'));
    render(<Navbar />);
    expect(screen.getByRole('link', { name: 'Create Problem' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Problems' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Verification Queue' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin Dashboard' })).toHaveAttribute('href', '/admin/dashboard');
  });
});

describe('active link styling', () => {
  it('marks Home active only on the exact root path', () => {
    mocks.pathname = '/';
    render(<Navbar />);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveStyle({ color: ACTIVE_COLOR });
    expect(screen.getByRole('link', { name: 'Problems' })).toHaveStyle({ color: INACTIVE_COLOR });
    // Read the inline style directly — jsdom normalizes font-weight: bold to
    // 700 in computed style, which toHaveStyle({ fontWeight: 'bold' }) rejects.
    const homeLink = screen.getByRole('link', { name: 'Home' }) as HTMLElement;
    const problemsLink = screen.getByRole('link', { name: 'Problems' }) as HTMLElement;
    expect(homeLink.style.fontWeight).toBe('600');
    expect(problemsLink.style.fontWeight).toBe('400');
  });

  it('marks Problems active on the exact /problems path', () => {
    mocks.pathname = '/problems';
    render(<Navbar />);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveStyle({ color: INACTIVE_COLOR });
    expect(screen.getByRole('link', { name: 'Problems' })).toHaveStyle({ color: ACTIVE_COLOR });
  });

  it('prefix-matches nested problem routes', () => {
    mocks.pathname = '/problems/123';
    render(<Navbar />);
    expect(screen.getByRole('link', { name: 'Problems' })).toHaveStyle({ color: ACTIVE_COLOR });
    expect(screen.getByRole('link', { name: 'Home' })).toHaveStyle({ color: INACTIVE_COLOR });
  });

  it('treats an undefined pathname as "/"', () => {
    mocks.pathname = undefined;
    render(<Navbar />);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveStyle({ color: ACTIVE_COLOR });
  });
});

describe('session actions', () => {
  it('logs out and routes to /login', () => {
    setAuth(true, mkUser('BASIC_USER'));
    render(<Navbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(mocks.auth.logout).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith('/login');
  });

  it('switches language via the EN/RO buttons', async () => {
    setAuth(false, null);
    render(<Navbar />);
    fireEvent.click(screen.getByRole('button', { name: 'ro' }));
    await waitFor(() => expect(i18n.language).toBe('ro'));
    expect(screen.getByRole('link', { name: 'Acasă' })).toBeInTheDocument(); // nav_home in ro
    fireEvent.click(screen.getByRole('button', { name: 'en' }));
    await waitFor(() => expect(i18n.language).toBe('en'));
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });
});
