import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import AdminDashboardPageRoute, { AdminDashboardPage } from './page';
import toast from 'react-hot-toast';
import { AdminService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import type { AdminUserType } from '@/types';

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/services/ApiService', () => ({
  AdminService: { getUsers: vi.fn(), updateUser: vi.fn(), getStats: vi.fn() },
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }));

// vitest runs with globals: false, so @testing-library/react cannot register
// its auto-cleanup — without this, rendered bodies accumulate across tests.
afterEach(cleanup);

const me: AdminUserType = {
  id: 1,
  username: 'admin',
  email: 'admin@example.com',
  role: 'ADMIN',
  is_staff: true,
  is_active: true,
  date_joined: '2026-01-15T10:00:00Z',
};

const other: AdminUserType = {
  id: 2,
  username: 'bob',
  email: 'bob@example.com',
  role: 'BASIC_USER',
  is_staff: false,
  is_active: false,
  date_joined: '2026-02-20T10:00:00Z',
};

type AuthShape = ReturnType<typeof useAuth>;

const authed = (overrides: Partial<AuthShape> = {}): AuthShape => ({
  isAuthenticated: true,
  token: 'token-1',
  refreshToken: null,
  user: me,
  login: vi.fn(),
  logout: vi.fn(),
  ...overrides,
});

describe('AdminDashboardPage (/admin/dashboard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue(authed());
    vi.mocked(AdminService.getUsers).mockResolvedValue([me, other]);
    vi.mocked(AdminService.getStats).mockResolvedValue({ user_count: 42, problem_count: 7, submission_count: 100 });
    vi.mocked(AdminService.updateUser).mockResolvedValue({});
  });

  it('renders nothing and redirects to / for a non-admin role (route guard)', () => {
    vi.mocked(useAuth).mockReturnValue(
      authed({ user: { ...me, role: 'BASIC_USER' }, token: null, isAuthenticated: false })
    );
    const { container } = render(<AdminDashboardPageRoute />);
    expect(container).toBeEmptyDOMElement();
    expect(replaceMock).toHaveBeenCalledWith('/');
  });

  it('shows the loading spinner while users are being fetched', () => {
    vi.mocked(AdminService.getUsers).mockReturnValue(new Promise(() => {}));
    render(<AdminDashboardPageRoute />);
    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0);
    expect(AdminService.getUsers).toHaveBeenCalledTimes(1);
  });

  it('renders the user table, the embedded SiteStats, and disabled self-controls', async () => {
    render(<AdminDashboardPageRoute />);
    expect(await screen.findByText('Admin Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Site Statistics')).toBeInTheDocument();
    expect(screen.getByText('User Management')).toBeInTheDocument();

    // Embedded SiteStats rendered with real data through the mocked service.
    expect(screen.getByText('Total Users')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();

    // Table headers + both user rows.
    expect(screen.getByRole('columnheader', { name: 'Username' })).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2 users

    // Own row: role + status selects disabled (self-lockout prevention).
    const ownSelects = within(rows[1]).getAllByRole('combobox');
    expect(ownSelects[0]).toBeDisabled();
    expect(ownSelects[1]).toBeDisabled();

    // Other row: selects enabled; status select reflects is_active=false.
    const otherSelects = within(rows[2]).getAllByRole('combobox');
    expect(otherSelects[0]).toBeEnabled();
    expect(otherSelects[1]).toBeEnabled();
    expect((otherSelects[0] as HTMLSelectElement).value).toBe('BASIC_USER');
    expect((otherSelects[1] as HTMLSelectElement).value).toBe('Inactive');
  });

  it('updates the role via the API, updates the row, and toasts success', async () => {
    render(<AdminDashboardPageRoute />);
    await screen.findByText('bob');
    const roleSelect = within(screen.getAllByRole('row')[2]).getAllByRole('combobox')[0];
    fireEvent.change(roleSelect, { target: { value: 'PROBLEM_VERIFIER' } });
    await waitFor(() => expect(AdminService.updateUser).toHaveBeenCalledWith(2, { role: 'PROBLEM_VERIFIER' }));
    expect(toast.success).toHaveBeenCalledWith('Role updated successfully.');
    await waitFor(() =>
      expect(
        (within(screen.getAllByRole('row')[2]).getAllByRole('combobox')[0] as HTMLSelectElement).value
      ).toBe('PROBLEM_VERIFIER')
    );
  });

  it('updates the active status via the API, updates the row, and toasts success', async () => {
    render(<AdminDashboardPageRoute />);
    await screen.findByText('bob');
    const statusSelect = within(screen.getAllByRole('row')[2]).getAllByRole('combobox')[1];
    fireEvent.change(statusSelect, { target: { value: 'Active' } });
    await waitFor(() => expect(AdminService.updateUser).toHaveBeenCalledWith(2, { is_active: true }));
    expect(toast.success).toHaveBeenCalledWith('Status updated successfully.');
    await waitFor(() =>
      expect(
        (within(screen.getAllByRole('row')[2]).getAllByRole('combobox')[1] as HTMLSelectElement).value
      ).toBe('Active')
    );
  });

  it('toasts the API error message when a role update fails', async () => {
    vi.mocked(AdminService.updateUser).mockRejectedValue(new Error('nope'));
    render(<AdminDashboardPageRoute />);
    await screen.findByText('bob');
    const roleSelect = within(screen.getAllByRole('row')[2]).getAllByRole('combobox')[0];
    fireEvent.change(roleSelect, { target: { value: 'ADMIN' } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to update role: nope'));
  });

  it('toasts a bare prefix when a status update fails with a non-Error rejection', async () => {
    vi.mocked(AdminService.updateUser).mockRejectedValue('boom');
    render(<AdminDashboardPageRoute />);
    await screen.findByText('bob');
    const statusSelect = within(screen.getAllByRole('row')[2]).getAllByRole('combobox')[1];
    fireEvent.change(statusSelect, { target: { value: 'Active' } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to update status: '));
  });

  it('shows the API error message when fetching users fails', async () => {
    vi.mocked(AdminService.getUsers).mockRejectedValue(new Error('service down'));
    render(<AdminDashboardPageRoute />);
    expect(await screen.findByText('service down')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('falls back to a generic message when the fetch error message is empty', async () => {
    vi.mocked(AdminService.getUsers).mockRejectedValue(new Error(''));
    render(<AdminDashboardPageRoute />);
    expect(await screen.findByText('Failed to fetch users.')).toBeInTheDocument();
  });

  it('falls back to a generic message for a non-Error fetch rejection', async () => {
    vi.mocked(AdminService.getUsers).mockRejectedValue(undefined);
    render(<AdminDashboardPageRoute />);
    expect(await screen.findByText('Failed to fetch users.')).toBeInTheDocument();
  });

  it('never fetches users and keeps showing the spinner without a token', async () => {
    vi.mocked(useAuth).mockReturnValue(authed({ token: null }));
    render(<AdminDashboardPageRoute />);
    await Promise.resolve(); // let the effect run
    expect(AdminService.getUsers).not.toHaveBeenCalled();
    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0);
  });

  it('enables every row select when auth.user is null (named export, direct render)', async () => {
    vi.mocked(useAuth).mockReturnValue(authed({ user: null }));
    render(<AdminDashboardPage />);
    await screen.findByText('bob');
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getAllByRole('combobox')[0]).toBeEnabled();
    expect(within(rows[2]).getAllByRole('combobox')[1]).toBeEnabled();
  });

  it('silently ignores role and status changes when the token disappears (rerender)', async () => {
    const { rerender } = render(<AdminDashboardPageRoute />);
    await screen.findByText('bob');
    vi.mocked(useAuth).mockReturnValue(authed({ token: null }));
    rerender(<AdminDashboardPageRoute />);
    const rows = screen.getAllByRole('row');
    fireEvent.change(within(rows[2]).getAllByRole('combobox')[0], { target: { value: 'ADMIN' } });
    fireEvent.change(within(rows[2]).getAllByRole('combobox')[1], { target: { value: 'Inactive' } });
    expect(AdminService.updateUser).not.toHaveBeenCalled();
  });
});
