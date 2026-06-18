import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';
import { AuthService } from '../services/ApiService';
import { makeUser } from '../test-utils';

jest.mock('../services/ApiService', () => ({
  AuthService: { getMe: jest.fn() },
}));

const getMeMock = AuthService.getMe as jest.Mock;

const Probe: React.FC = () => {
  const { isAuthenticated, user, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="auth">{isAuthenticated ? 'yes' : 'no'}</span>
      <span data-testid="user">{user ? user.username : 'none'}</span>
      <button onClick={() => login('a', 'r', makeUser({ username: 'fresh' }))}>do-login</button>
      <button onClick={logout}>do-logout</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    getMeMock.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hydrates the user from localStorage without calling getMe', async () => {
    localStorage.setItem('accessToken', 'tok');
    localStorage.setItem('user', JSON.stringify(makeUser({ username: 'stored' })));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId('user')).toHaveTextContent('stored');
    expect(getMeMock).not.toHaveBeenCalled();
  });

  it('fetches and sets the user on load when a token exists but no stored user', async () => {
    localStorage.setItem('accessToken', 'tok');
    getMeMock.mockResolvedValue(makeUser({ username: 'fetched' }));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('fetched'));
    expect(JSON.parse(localStorage.getItem('user') as string).username).toBe('fetched');
  });

  it('warns and keeps no user when getMe resolves falsy', async () => {
    localStorage.setItem('accessToken', 'tok');
    getMeMock.mockResolvedValue(null);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(getMeMock).toHaveBeenCalled());
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });

  it('logs out and clears storage when getMe rejects', async () => {
    localStorage.setItem('accessToken', 'tok');
    localStorage.setItem('refreshToken', 'r');
    getMeMock.mockRejectedValue(new Error('401'));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('no'));
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('does not fetch when there is no token', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(getMeMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('auth')).toHaveTextContent('no');
  });

  it('login persists credentials and logout clears them', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'do-login' }));
    expect(screen.getByTestId('auth')).toHaveTextContent('yes');
    expect(screen.getByTestId('user')).toHaveTextContent('fresh');
    expect(localStorage.getItem('accessToken')).toBe('a');
    await userEvent.click(screen.getByRole('button', { name: 'do-logout' }));
    expect(screen.getByTestId('auth')).toHaveTextContent('no');
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('useAuth throws when used outside an AuthProvider', () => {
    const Bare: React.FC = () => {
      useAuth();
      return null;
    };
    expect(() => render(<Bare />)).toThrow('useAuth must be used within an AuthProvider');
  });
});
