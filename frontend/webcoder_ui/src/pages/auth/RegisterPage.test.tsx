import React from 'react';
import { screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterPage from './RegisterPage';
import { renderWithProviders } from '../../test-utils';
import { AuthService } from '../../services/ApiService';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../../services/ApiService', () => ({
  AuthService: { register: jest.fn() },
}));

const register = AuthService.register as jest.Mock;

const fill = async (pw = 'secret', pw2 = 'secret'): Promise<void> => {
  await userEvent.type(screen.getByLabelText(/Username/), 'bob');
  await userEvent.type(screen.getByLabelText(/Email Address/), 'bob@x.io');
  await userEvent.type(screen.getByLabelText('Password *'), pw);
  await userEvent.type(screen.getByLabelText(/Confirm Password/), pw2);
  await userEvent.click(screen.getByRole('button', { name: 'Register' }));
};

describe('RegisterPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    register.mockReset();
  });

  it('renders the registration form fields', () => {
    renderWithProviders(<RegisterPage />, { withAuth: false });
    expect(screen.getByRole('heading', { name: 'Register' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Login here' })).toBeInTheDocument();
  });

  it('shows a mismatch error and does not call the API when passwords differ', async () => {
    renderWithProviders(<RegisterPage />, { withAuth: false });
    await fill('one', 'two');
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it('registers successfully and redirects to login after the timeout', async () => {
    jest.useFakeTimers();
    register.mockResolvedValue({});
    renderWithProviders(<RegisterPage />, { withAuth: false });

    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'bob' } });
    fireEvent.change(screen.getByLabelText(/Email Address/), { target: { value: 'b@x.io' } });
    fireEvent.change(screen.getByLabelText('Password *'), { target: { value: 'secret' } });
    fireEvent.change(screen.getByLabelText(/Confirm Password/), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(
      await screen.findByText('Registration successful! Redirecting to login...'),
    ).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(mockNavigate).toHaveBeenCalledWith('/login');
    jest.useRealTimers();
  });

  it('joins field errors from a structured API error response', async () => {
    register.mockRejectedValue({
      response: { data: { username: ['taken'], email: ['invalid'] } },
    });
    renderWithProviders(<RegisterPage />, { withAuth: false });
    await fill();
    expect(await screen.findByText('taken invalid')).toBeInTheDocument();
  });

  it('shows the generic error when the structured response is empty', async () => {
    register.mockRejectedValue({ response: { data: {} } });
    renderWithProviders(<RegisterPage />, { withAuth: false });
    await fill();
    expect(
      await screen.findByText('Registration failed. Please check your input.'),
    ).toBeInTheDocument();
  });

  it('falls back to the error message for a non-structured error', async () => {
    register.mockRejectedValue(new Error('Server exploded'));
    renderWithProviders(<RegisterPage />, { withAuth: false });
    await fill();
    expect(await screen.findByText('Server exploded')).toBeInTheDocument();
  });

  it('falls back to the default message when a non-structured error has no message', async () => {
    register.mockRejectedValue({});
    renderWithProviders(<RegisterPage />, { withAuth: false });
    await fill();
    expect(await screen.findByText('Registration failed. Please try again.')).toBeInTheDocument();
  });
});
