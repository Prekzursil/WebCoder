import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CompleteRegistrationPage from './CompleteRegistrationPage';
import { renderWithProviders } from '../../test-utils';
import { AuthService } from '../../services/ApiService';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../../services/ApiService', () => ({
  AuthService: { register: jest.fn(), getMe: jest.fn() },
}));

const register = AuthService.register as jest.Mock;

const renderAt = (search: string): void => {
  renderWithProviders(<CompleteRegistrationPage />, {
    initialEntries: [`/complete-registration${search}`],
  });
};

const submit = async (): Promise<void> => {
  await userEvent.type(screen.getByLabelText(/^Username/), 'charlie');
  await userEvent.click(screen.getByRole('button', { name: 'Complete Registration' }));
};

describe('CompleteRegistrationPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    register.mockReset();
    localStorage.clear();
  });

  it('redirects to login when no email is present in the query string', async () => {
    renderAt('');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'));
  });

  it('prefills the disabled email field from the query string', () => {
    renderAt('?email=new@user.io');
    expect(screen.getByLabelText(/Email Address/)).toHaveValue('new@user.io');
    expect(mockNavigate).not.toHaveBeenCalledWith('/login');
  });

  it('logs in and navigates home on a successful registration', async () => {
    register.mockResolvedValue({
      access: 'a',
      refresh: 'r',
      user: { id: 2, username: 'charlie', email: 'new@user.io', role: 'BASIC_USER' },
    });
    renderAt('?email=new@user.io');
    await submit();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
    expect(localStorage.getItem('accessToken')).toBe('a');
  });

  it('shows a completion error when the response is missing tokens', async () => {
    register.mockResolvedValue({ access: 'a' });
    renderAt('?email=new@user.io');
    await submit();
    expect(await screen.findByText('Failed to complete registration.')).toBeInTheDocument();
  });

  it('shows the API detail message on an axios-style error', async () => {
    register.mockRejectedValue({ response: { data: { detail: 'Email already used' } } });
    renderAt('?email=new@user.io');
    await submit();
    expect(await screen.findByText('Email already used')).toBeInTheDocument();
  });

  it('falls back to the error message when no API detail is present', async () => {
    register.mockRejectedValue(new Error('Timeout'));
    renderAt('?email=new@user.io');
    await submit();
    expect(await screen.findByText('Timeout')).toBeInTheDocument();
  });

  it('falls back to the default message when the error has no message', async () => {
    register.mockRejectedValue({});
    renderAt('?email=new@user.io');
    await submit();
    expect(await screen.findByText('Failed to complete registration.')).toBeInTheDocument();
  });

  it('shows a spinner while the request is in flight', async () => {
    let resolveReg: (v: unknown) => void = () => undefined;
    register.mockReturnValue(new Promise((resolve) => (resolveReg = resolve)));
    renderAt('?email=new@user.io');
    await submit();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    resolveReg({ access: 'a', refresh: 'r', user: { id: 2, username: 'c', email: 'e', role: 'BASIC_USER' } });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });
});
