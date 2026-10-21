import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { cookies } from 'next/headers';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import NotFound from './not-found';

function mockLocale(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === 'i18nextLng' ? (value === undefined ? undefined : { value }) : undefined,
  } as Awaited<ReturnType<typeof cookies>>);
}

afterEach(cleanup);

describe('not-found (catch-all "*")', () => {
  it('renders the default 404 copy in English', async () => {
    mockLocale(undefined);
    render(await NotFound());

    expect(screen.getByRole('heading', { name: '404 - Page Not Found' })).toBeInTheDocument();
    expect(
      screen.getByText('The page you are looking for does not exist or you may not have permission to view it.')
    ).toBeInTheDocument();
  });

  it('offers onward navigation instead of a dead end (A14)', async () => {
    mockLocale(undefined);
    render(await NotFound());

    expect(screen.getByRole('link', { name: 'Browse Problems' })).toHaveAttribute('href', '/problems');
    expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Leaderboard' })).toHaveAttribute('href', '/leaderboard');
    expect(screen.getByRole('link', { name: 'Community Forum' })).toHaveAttribute('href', '/forum');
    expect(screen.getByRole('link', { name: 'My Submissions' })).toHaveAttribute('href', '/my-submissions');
  });

  it('renders the Romanian copy for Romanian visitors (ro values now exist)', async () => {
    mockLocale('ro');
    render(await NotFound());

    expect(screen.getByRole('heading', { name: '404 - Pagină Negăsită' })).toBeInTheDocument();
    expect(
      screen.getByText('Pagina pe care o cauți nu există sau este posibil să nu ai permisiunea să o vezi.')
    ).toBeInTheDocument();
  });
});
