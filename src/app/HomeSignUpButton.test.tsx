import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useAuth } from '@/context/AuthContext';

vi?.mock('@/context/AuthContext', () => ({
  useAuth: vi?.fn(),
}));

import HomeSignUpButton from './HomeSignUpButton';

afterEach(cleanup);

beforeEach(() => {
  vi?.mocked(useAuth)?.mockReset();
});

describe('HomeSignUpButton', () => {
  it('renders a Sign Up link to /register for anonymous visitors', () => {
    vi?.mocked(useAuth)?.mockReturnValue({
      isAuthenticated: false,
      token: null,
      refreshToken: null,
      user: null,
      login: vi?.fn(),
      logout: vi?.fn(),
    });

    render(<HomeSignUpButton label="Sign Up" />);

    const link = screen?.getByRole('link', { name: 'Sign Up' });
    expect(link?.getAttribute('href'))?.toBe('/register');
  });

  it('renders the server-provided localized label', () => {
    vi?.mocked(useAuth)?.mockReturnValue({
      isAuthenticated: false,
      token: null,
      refreshToken: null,
      user: null,
      login: vi?.fn(),
      logout: vi?.fn(),
    });

    render(<HomeSignUpButton label="Înregistrează-te" />);
    expect(screen?.getByRole('link', { name: 'Înregistrează-te' }))?.toBeInTheDocument();
  });

  it('renders nothing when the user is authenticated', () => {
    vi?.mocked(useAuth)?.mockReturnValue({
      isAuthenticated: true,
      token: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        id: 1,
        username: 'alice',
        email: 'alice@example.com',
        role: 'BASIC_USER',
      },
      login: vi?.fn(),
      logout: vi?.fn(),
    });

    const { container } = render(<HomeSignUpButton label="Sign Up" />);
    expect(container)?.toBeEmptyDOMElement();
  });
});
