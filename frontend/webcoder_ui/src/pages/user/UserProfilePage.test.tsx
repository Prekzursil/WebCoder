import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import UserProfilePage from './UserProfilePage';
import { renderWithProviders, seedAuthUser, makeUser } from '../../test-utils';
import { AuthService } from '../../services/ApiService';

let mockParams: { userId?: string } = {};
jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useParams: () => mockParams,
}));
jest.mock('../../services/ApiService', () => ({
  AuthService: { getUser: jest.fn(), getMe: jest.fn(), changePassword: jest.fn() },
}));

const getUser = AuthService.getUser as jest.Mock;
const getMe = AuthService.getMe as jest.Mock;
const changePassword = AuthService.changePassword as jest.Mock;

const profile = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 1,
  username: 'alice',
  email: 'alice@x.io',
  role: 'BASIC_USER',
  ...overrides,
});

const fillPasswords = (cur: string, nw: string, confirm: string): void => {
  fireEvent.change(screen.getByLabelText(/Current Password/), { target: { value: cur } });
  fireEvent.change(screen.getByLabelText('New Password *'), { target: { value: nw } });
  fireEvent.change(screen.getByLabelText(/Confirm New Password/), { target: { value: confirm } });
  fireEvent.submit(screen.getByRole('button', { name: 'Change Password' }).closest('form')!);
};

describe('UserProfilePage', () => {
  beforeEach(() => {
    mockParams = {};
    getUser.mockReset();
    getMe.mockReset();
    changePassword.mockReset();
    seedAuthUser(makeUser({ id: 1 }));
  });
  afterEach(() => localStorage.clear());

  it('shows a spinner while the profile loads', () => {
    getMe.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<UserProfilePage />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('loads the logged-in user via getMe when no userId is in the route', async () => {
    getMe.mockResolvedValue(profile());
    renderWithProviders(<UserProfilePage />);
    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(getMe).toHaveBeenCalled();
    // own profile -> change-password form visible
    expect(screen.getByRole('heading', { name: 'Change Password' })).toBeInTheDocument();
  });

  it('loads a specific user via getUser when a userId is present', async () => {
    mockParams = { userId: '2' };
    getUser.mockResolvedValue(profile({ id: 2, username: 'bob' }));
    renderWithProviders(<UserProfilePage />);
    expect(await screen.findByText('bob')).toBeInTheDocument();
    expect(getUser).toHaveBeenCalledWith('2');
    // not own profile -> no change-password form
    expect(screen.queryByRole('heading', { name: 'Change Password' })).not.toBeInTheDocument();
  });

  it('treats a userId matching the logged-in user as own profile', async () => {
    mockParams = { userId: '1' };
    getUser.mockResolvedValue(profile({ id: 1 }));
    renderWithProviders(<UserProfilePage />);
    await screen.findByText('alice');
    expect(screen.getByRole('heading', { name: 'Change Password' })).toBeInTheDocument();
  });

  it('renders nothing-fetched (user not found) when no userId and no auth user', async () => {
    localStorage.clear();
    renderWithProviders(<UserProfilePage />);
    expect(await screen.findByText('User not found.')).toBeInTheDocument();
    expect(getMe).not.toHaveBeenCalled();
  });

  it('shows an error when the profile fetch fails', async () => {
    getMe.mockRejectedValue(new Error('nope'));
    renderWithProviders(<UserProfilePage />);
    expect(await screen.findByText('Failed to load user profile.')).toBeInTheDocument();
  });

  it('rejects mismatched passwords without calling the API', async () => {
    getMe.mockResolvedValue(profile());
    renderWithProviders(<UserProfilePage />);
    await screen.findByText('alice');
    fillPasswords('old', 'new1', 'new2');
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('requires being logged in (token) to change the password', async () => {
    // user hydrated from storage (so the own-profile form shows) but NO token,
    // so the handler hits the "must be logged in" guard.
    localStorage.clear();
    localStorage.setItem('user', JSON.stringify(makeUser({ id: 1 })));
    getMe.mockResolvedValue(profile());
    renderWithProviders(<UserProfilePage />);
    await screen.findByText('alice');
    fillPasswords('old', 'same', 'same');
    expect(
      await screen.findByText('You must be logged in to change your password.'),
    ).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('changes the password successfully and clears the fields', async () => {
    getMe.mockResolvedValue(profile());
    changePassword.mockResolvedValue({});
    renderWithProviders(<UserProfilePage />);
    await screen.findByText('alice');
    fillPasswords('old', 'newpass', 'newpass');
    expect(await screen.findByText('Password changed successfully.')).toBeInTheDocument();
    expect(changePassword).toHaveBeenCalledWith({
      old_password: 'old',
      new_password1: 'newpass',
      new_password2: 'newpass',
    });
    expect(screen.getByLabelText(/Current Password/)).toHaveValue('');
  });

  it('formats a structured field-error response (array and scalar values)', async () => {
    getMe.mockResolvedValue(profile());
    changePassword.mockRejectedValue({
      response: { data: { old_password: ['wrong'], detail: 'bad' } },
    });
    renderWithProviders(<UserProfilePage />);
    await screen.findByText('alice');
    fillPasswords('old', 'newpass', 'newpass');
    expect(await screen.findByText('old_password: wrong; detail: bad')).toBeInTheDocument();
  });

  it('shows the generic message when the structured response is empty', async () => {
    getMe.mockResolvedValue(profile());
    changePassword.mockRejectedValue({ response: { data: {} } });
    renderWithProviders(<UserProfilePage />);
    await screen.findByText('alice');
    fillPasswords('old', 'newpass', 'newpass');
    expect(await screen.findByText('Password change failed.')).toBeInTheDocument();
  });

  it('falls back to the error message for a non-structured error', async () => {
    getMe.mockResolvedValue(profile());
    changePassword.mockRejectedValue(new Error('server down'));
    renderWithProviders(<UserProfilePage />);
    await screen.findByText('alice');
    fillPasswords('old', 'newpass', 'newpass');
    expect(await screen.findByText('server down')).toBeInTheDocument();
  });

  it('falls back to the default message when a non-structured error has no message', async () => {
    getMe.mockResolvedValue(profile());
    changePassword.mockRejectedValue({});
    renderWithProviders(<UserProfilePage />);
    await screen.findByText('alice');
    fillPasswords('old', 'newpass', 'newpass');
    expect(await screen.findByText('Password change failed.')).toBeInTheDocument();
  });
});
