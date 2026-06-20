import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import toast from 'react-hot-toast';
import AdminDashboardPage from './AdminDashboardPage';
import { renderWithProviders, seedAuthUser, makeUser } from '../../test-utils';
import { AdminService } from '../../services/ApiService';

jest.mock('../../services/ApiService', () => ({
  AdminService: { getUsers: jest.fn(), updateUser: jest.fn(), getStats: jest.fn() },
}));
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

const getUsers = AdminService.getUsers as jest.Mock;
const updateUser = AdminService.updateUser as jest.Mock;
const getStats = AdminService.getStats as jest.Mock;
const toastSuccess = (toast as unknown as { success: jest.Mock }).success;
const toastError = (toast as unknown as { error: jest.Mock }).error;

const otherUser = {
  id: 2,
  username: 'bob',
  email: 'bob@x.io',
  role: 'BASIC_USER' as const,
  is_staff: false,
  is_active: true,
  date_joined: '2024-01-01T00:00:00Z',
};

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    getUsers.mockReset();
    updateUser.mockReset();
    getStats.mockResolvedValue({ data: { user_count: 1, problem_count: 1, submission_count: 1 } });
    toastSuccess.mockClear();
    toastError.mockClear();
    seedAuthUser(makeUser({ id: 1, role: 'ADMIN' }));
  });
  afterEach(() => localStorage.clear());

  it('shows the loading spinner while users are being fetched', () => {
    getUsers.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<AdminDashboardPage />);
    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0);
  });

  it('renders the user table once users load', async () => {
    getUsers.mockResolvedValue({ data: [otherUser] });
    renderWithProviders(<AdminDashboardPage />);
    expect(await screen.findByText('bob')).toBeInTheDocument();
    expect(screen.getByText('bob@x.io')).toBeInTheDocument();
  });

  it('shows an error message when fetching users fails', async () => {
    getUsers.mockRejectedValue(new Error('forbidden'));
    renderWithProviders(<AdminDashboardPage />);
    expect(await screen.findByText('forbidden')).toBeInTheDocument();
  });

  it('shows the default error message when the failure has no message', async () => {
    getUsers.mockRejectedValue({});
    renderWithProviders(<AdminDashboardPage />);
    expect(await screen.findByText('Failed to fetch users.')).toBeInTheDocument();
  });

  it('updates a role and toasts success', async () => {
    getUsers.mockResolvedValue({ data: [otherUser] });
    updateUser.mockResolvedValue({});
    renderWithProviders(<AdminDashboardPage />);
    await screen.findByText('bob');
    const roleSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(roleSelect, { target: { value: 'ADMIN' } });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Role updated successfully.'));
    expect(updateUser).toHaveBeenCalledWith(2, { role: 'ADMIN' });
  });

  it('toasts an error when the role update fails', async () => {
    getUsers.mockResolvedValue({ data: [otherUser] });
    updateUser.mockRejectedValue(new Error('nope'));
    renderWithProviders(<AdminDashboardPage />);
    await screen.findByText('bob');
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'ADMIN' } });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to update role: nope'));
  });

  it('updates a status and toasts success', async () => {
    getUsers.mockResolvedValue({ data: [otherUser] });
    updateUser.mockResolvedValue({});
    renderWithProviders(<AdminDashboardPage />);
    await screen.findByText('bob');
    const statusSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(statusSelect, { target: { value: 'Inactive' } });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Status updated successfully.'));
    expect(updateUser).toHaveBeenCalledWith(2, { is_active: false });
  });

  it('toasts an error when the status update fails', async () => {
    getUsers.mockResolvedValue({ data: [otherUser] });
    updateUser.mockRejectedValue(new Error('bad'));
    renderWithProviders(<AdminDashboardPage />);
    await screen.findByText('bob');
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'Inactive' } });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to update status: bad'));
  });

  it('only mutates the targeted user when multiple users are listed', async () => {
    const second = { ...otherUser, id: 3, username: 'carol', is_active: false };
    getUsers.mockResolvedValue({ data: [otherUser, second] });
    updateUser.mockResolvedValue({});
    renderWithProviders(<AdminDashboardPage />);
    await screen.findByText('carol');
    // change bob's (id 2) role + status; carol (id 3) must be left untouched by
    // both .map() calls (exercises the `: user` else branch over a non-match).
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'ADMIN' } });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Role updated successfully.'));
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'Inactive' } });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Status updated successfully.'));
    // carol's status select still reflects her own (inactive) value.
    expect(screen.getAllByRole('combobox')[3]).toHaveValue('Inactive');
  });

  it('disables the controls for the currently logged-in admin', async () => {
    const self = { ...otherUser, id: 1, username: 'me', is_active: true };
    getUsers.mockResolvedValue({ data: [self] });
    renderWithProviders(<AdminDashboardPage />);
    await screen.findByText('me');
    screen.getAllByRole('combobox').forEach((select) => expect(select).toBeDisabled());
  });

  it('does not fetch users when there is no auth token', async () => {
    localStorage.clear();
    renderWithProviders(<AdminDashboardPage />, { withAuth: true });
    await waitFor(() => expect(getStats).toHaveBeenCalled());
    expect(getUsers).not.toHaveBeenCalled();
  });
});
