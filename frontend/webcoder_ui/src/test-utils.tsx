import React, { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { User } from './types';

/**
 * Seed localStorage with an authenticated user so AuthProvider hydrates from it
 * synchronously (avoids the async getMe fetch path on mount).
 */
export const seedAuthUser = (user: User): void => {
  localStorage.setItem('accessToken', 'test-access-token');
  localStorage.setItem('refreshToken', 'test-refresh-token');
  localStorage.setItem('user', JSON.stringify(user));
};

export const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 1,
  username: 'tester',
  email: 'tester@example.com',
  role: 'BASIC_USER',
  ...overrides,
});

interface WrapperOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
  initialEntries?: string[];
  withAuth?: boolean;
}

/**
 * Render a component wrapped in MemoryRouter and (optionally) AuthProvider.
 */
export const renderWithProviders = (
  ui: ReactElement,
  { route = '/', initialEntries, withAuth = true, ...options }: WrapperOptions = {},
): ReturnType<typeof render> => {
  const entries = initialEntries ?? [route];
  const Wrapper = ({ children }: { children: ReactNode }) => {
    const tree = <MemoryRouter initialEntries={entries}>{children}</MemoryRouter>;
    return withAuth ? <AuthProvider>{tree}</AuthProvider> : tree;
  };
  return render(ui, { wrapper: Wrapper, ...options });
};
