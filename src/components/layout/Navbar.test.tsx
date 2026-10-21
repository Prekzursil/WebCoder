import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import i18n from '@/i18n';
import type { User } from '@/types';
import Navbar from './Navbar';

// Navbar tests for the reworked IA [SPEC-GAPS A1/A8/F21]:
//  - desktop shows Home/Problems/Leaderboard/Forum for everyone
//  - account + role links live in the avatar dropdown menu (matrix per role)
//  - the hamburger opens the mobile drawer with the full link set
//  - the global search box routes to /problems?q=<term>
//  - logout routes to /login; EN/RO switcher flips the language
// i18n runs for real.

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
  replace: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

const mkUser = (role: User['role']): User => ({ id: 1, username: 'tester', email: 't@example.com', role });

function setAuth(authenticated: boolean, user: User | null = null) {
  mocks.auth.isAuthenticated = authenticated;
  mocks.auth.user = user;
  mocks.auth.token = authenticated ? 'tok' : null;
}

/** The avatar dropdown must be open for its links to exist in the DOM. */
function openUserMenu() {
  fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));
  return screen.getByRole('menu');
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.pathname = '/';
  setAuth(false, null);
  await i18n.changeLanguage('en');
});

afterEach(cleanup);

describe('desktop primary navigation (all roles)', () => {
  it('shows the four primary links and no privileged links when anonymous', () => {
    setAuth(false, null);
    render(<Navbar />);
    for (const name of ['Home', 'Problems', 'Leaderboard', 'Forum']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Register' })).toBeInTheDocument();
    expect(screen.queryByText('tester')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Account menu/i })).not.toBeInTheDocument();
  });

  it('marks the active link via the nav-link--active class and aria-current', () => {
    mocks.pathname = '/problems';
    render(<Navbar />);
    const problems = screen.getByRole('link', { name: 'Problems' });
    expect(problems.className).toMatch(/nav-link--active/);
    expect(problems).toHaveAttribute('aria-current', 'page');
    const home = screen.getByRole('link', { name: 'Home' });
    expect(home.className).not.toMatch(/nav-link--active/);
    expect(home).not.toHaveAttribute('aria-current');
  });

  it('prefix-matches nested routes (/problems/123 marks Problems active)', () => {
    mocks.pathname = '/problems/123';
    render(<Navbar />);
    expect(screen.getByRole('link', { name: 'Problems' }).className).toMatch(/nav-link--active/);
    expect(screen.getByRole('link', { name: 'Home' }).className).not.toMatch(/nav-link--active/);
  });

  it('treats an undefined pathname as "/"', () => {
    mocks.pathname = undefined;
    render(<Navbar />);
    expect(screen.getByRole('link', { name: 'Home' }).className).toMatch(/nav-link--active/);
  });
});

describe('avatar dropdown link matrix by role [A8]', () => {
  it('shows the account group for a basic user but no contributor links', () => {
    setAuth(true, mkUser('BASIC_USER'));
    render(<Navbar />);
    const menu = openUserMenu();
    expect(within(menu).getByRole('menuitem', { name: 'Profile' })).toHaveAttribute('href', '/profile');
    expect(within(menu).getByRole('menuitem', { name: 'My Submissions' })).toHaveAttribute('href', '/my-submissions');
    expect(within(menu).getByRole('menuitem', { name: 'History' })).toHaveAttribute('href', '/submission-history');
    expect(within(menu).queryByText('Create Problem')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Verification Queue')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Admin Dashboard')).not.toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Logout' })).toBeInTheDocument();
  });

  it('falls back to "User" when authenticated without a user object', () => {
    setAuth(true, null);
    render(<Navbar />);
    expect(screen.getAllByText('User').length).toBeGreaterThan(0);
    const menu = openUserMenu();
    expect(within(menu).queryByRole('menuitem', { name: 'Create Problem' })).not.toBeInTheDocument();
  });

  it('adds the contributor group for PROBLEM_CREATOR', () => {
    setAuth(true, mkUser('PROBLEM_CREATOR'));
    render(<Navbar />);
    const menu = openUserMenu();
    expect(within(menu).getByRole('menuitem', { name: 'Create Problem' })).toHaveAttribute('href', '/problems/create');
    expect(within(menu).getByRole('menuitem', { name: 'My Problems' })).toHaveAttribute('href', '/my-created-problems');
    expect(within(menu).queryByText('Verification Queue')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Admin Dashboard')).not.toBeInTheDocument();
  });

  it('adds creator + queue links for PROBLEM_VERIFIER but not the admin dashboard', () => {
    setAuth(true, mkUser('PROBLEM_VERIFIER'));
    render(<Navbar />);
    const menu = openUserMenu();
    expect(within(menu).getByRole('menuitem', { name: 'Create Problem' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'My Problems' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Verification Queue' })).toHaveAttribute('href', '/admin/problem-queue');
    expect(within(menu).queryByText('Admin Dashboard')).not.toBeInTheDocument();
  });

  it('shows every link for ADMIN', () => {
    setAuth(true, mkUser('ADMIN'));
    render(<Navbar />);
    const menu = openUserMenu();
    expect(within(menu).getByRole('menuitem', { name: 'Create Problem' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'My Problems' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Verification Queue' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Admin Dashboard' })).toHaveAttribute('href', '/admin/dashboard');
  });

  it('closes the menu on Escape', () => {
    setAuth(true, mkUser('BASIC_USER'));
    render(<Navbar />);
    openUserMenu();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('mobile drawer [A1]', () => {
  it('opens from the hamburger and lists primary + account links, then closes', () => {
    setAuth(true, mkUser('PROBLEM_VERIFIER'));
    render(<Navbar />);

    fireEvent.click(screen.getByRole('button', { name: /Open navigation menu/i }));
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: 'Leaderboard' })).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: 'My Submissions' })).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: 'Verification Queue' })).toBeInTheDocument();
    expect(within(drawer).getAllByRole('button', { name: 'ro' }).length).toBeGreaterThan(0); // language mirror

    // Navigating a drawer link closes it.
    fireEvent.click(within(drawer).getByRole('link', { name: 'Problems' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    setAuth(false, null);
    render(<Navbar />);
    fireEvent.click(screen.getByRole('button', { name: /Open navigation menu/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('global search [F21]', () => {
  it('routes to /problems?q=<term> on submit', () => {
    render(<Navbar />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'two sum' } });
    fireEvent.submit(input.closest('form')!);
    expect(mocks.push).toHaveBeenCalledWith('/problems?q=two%20sum');
  });

  it('routes to the bare catalog for an empty term', () => {
    render(<Navbar />);
    const input = screen.getByRole('searchbox');
    fireEvent.submit(input.closest('form')!);
    expect(mocks.push).toHaveBeenCalledWith('/problems');
  });
});

describe('session actions', () => {
  it('logs out and routes to /login', () => {
    setAuth(true, mkUser('BASIC_USER'));
    render(<Navbar />);
    fireEvent.click(within(openUserMenu()).getByRole('menuitem', { name: 'Logout' }));
    expect(mocks.auth.logout).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith('/login');
  });

  it('switches language via the EN/RO buttons', async () => {
    setAuth(false, null);
    render(<Navbar />);
    fireEvent.click(screen.getAllByRole('button', { name: 'ro' })[0]);
    await waitFor(() => expect(i18n.language).toBe('ro'));
    expect(screen.getByRole('link', { name: 'Acasă' })).toBeInTheDocument(); // nav_home in ro
    fireEvent.click(screen.getAllByRole('button', { name: 'en' })[0]);
    await waitFor(() => expect(i18n.language).toBe('en'));
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });
});
