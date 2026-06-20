import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './LoginPage';
import { renderWithProviders } from '../../test-utils';
import { AuthService } from '../../services/ApiService';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../../services/ApiService', () => ({
  AuthService: { login: jest.fn(), getMe: jest.fn() },
}));

const login = AuthService.login as jest.Mock;

const fillAndSubmit = async (): Promise<void> => {
  await userEvent.type(screen.getByLabelText(/Username/), 'alice');
  await userEvent.type(screen.getByLabelText(/Password/), 'pw');
  await userEvent.click(screen.getByRole('button', { name: 'Login' }));
};

describe('LoginPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    login.mockReset();
    localStorage.clear();
  });

  it('renders the form, OAuth buttons and register link', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Google' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Register here' })).toBeInTheDocument();
  });

  it('logs in and navigates home on a successful response', async () => {
    login.mockResolvedValue({
      access: 'a',
      refresh: 'r',
      user: { id: 1, username: 'alice', email: 'a@b.c', role: 'BASIC_USER' },
    });
    renderWithProviders(<LoginPage />);
    await fillAndSubmit();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
    expect(localStorage.getItem('accessToken')).toBe('a');
  });

  it('shows a no-token error when the response is missing fields', async () => {
    login.mockResolvedValue({ access: 'a' });
    renderWithProviders(<LoginPage />);
    await fillAndSubmit();
    expect(await screen.findByText('Login failed: No token received.')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows the API detail message from an axios-style error', async () => {
    login.mockRejectedValue({ response: { data: { detail: 'Account locked' } } });
    renderWithProviders(<LoginPage />);
    await fillAndSubmit();
    expect(await screen.findByText('Account locked')).toBeInTheDocument();
  });

  it('falls back to the error message when no API detail is present', async () => {
    login.mockRejectedValue(new Error('Network error'));
    renderWithProviders(<LoginPage />);
    await fillAndSubmit();
    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });

  it('falls back to the default message when the error has no message', async () => {
    login.mockRejectedValue({});
    renderWithProviders(<LoginPage />);
    await fillAndSubmit();
    expect(
      await screen.findByText('Login failed. Please check your credentials.'),
    ).toBeInTheDocument();
  });

  it('shows a progress spinner while the request is in flight', async () => {
    let resolveLogin: (v: unknown) => void = () => undefined;
    login.mockReturnValue(new Promise((resolve) => (resolveLogin = resolve)));
    renderWithProviders(<LoginPage />);
    await fillAndSubmit();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    resolveLogin({
      access: 'a',
      refresh: 'r',
      user: { id: 1, username: 'x', email: 'e', role: 'BASIC_USER' },
    });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  });
});
