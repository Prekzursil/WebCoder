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

  it('falls back to English copy for Romanian visitors (no ro value exists, same as CRA)', async () => {
    mockLocale('ro');
    render(await NotFound());

    expect(screen.getByRole('heading', { name: '404 - Page Not Found' })).toBeInTheDocument();
  });
});
