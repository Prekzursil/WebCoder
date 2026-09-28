import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { cookies } from 'next/headers';
import { useAuth } from '@/context/AuthContext';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import Home from './page';
import { metadata } from './page';

function mockLocale(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === 'i18nextLng' ? (value === undefined ? undefined : { value }) : undefined,
  } as Awaited<ReturnType<typeof cookies>>);
}

// RTL auto-cleanup only registers under vitest globals:true; this config
// keeps globals off, so cleanup is explicit.
afterEach(cleanup);

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated: false,
    token: null,
    refreshToken: null,
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
  });
});

describe('HomePage (route "/")', () => {
  it('renders the welcome copy and both CTAs in English by default', async () => {
    mockLocale(undefined);
    render(await Home());

    expect(screen.getByRole('heading', { level: 1, name: 'Welcome to WebCoder' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'The ultimate platform for competitive programming.' })
    ).toBeInTheDocument();
    expect(screen.getByText(/compete with a community of developers/i)).toBeInTheDocument();

    const viewProblems = screen.getByRole('link', { name: 'View Problems' });
    expect(viewProblems.getAttribute('href')).toBe('/problems');
    const signUp = screen.getByRole('link', { name: 'Sign Up' });
    expect(signUp.getAttribute('href')).toBe('/register');
  });

  it('renders the localized welcome when the i18next cookie is Romanian', async () => {
    mockLocale('ro');
    render(await Home());

    expect(screen.getByRole('heading', { level: 1, name: 'Bun venit la WebCoder' })).toBeInTheDocument();
    // Subtitle now carries a Romanian value in the shared resources.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Platforma definitivă pentru programare competitivă.' })
    ).toBeInTheDocument();
  });

  it('exports static SEO metadata', () => {
    expect(metadata.title).toBe('WebCoder — Competitive Programming Platform');
    expect(metadata.description).toMatch(/compete with a community of developers/i);
  });
});
