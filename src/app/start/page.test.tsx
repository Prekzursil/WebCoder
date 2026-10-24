// [roadmap ONB-1] /start onboarding page: the first-run trio renders from
// the starters endpoint, with the how-it-works strip and localized empty
// and error states.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

const { getStarterProblemsMock } = vi.hoisted(() => ({
  getStarterProblemsMock: vi.fn(),
}));

vi.mock('../problems/_lib/problems-api', () => ({
  getStarterProblems: getStarterProblemsMock,
}));

import StartPage from './page';
import { cookies } from 'next/headers';

const { mockLocale } = vi.hoisted(() => ({
  mockLocale: (locale: string | undefined) => {
    vi.mocked(cookies).mockResolvedValue({
      get: () => ({ value: locale }),
    } as never);
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockLocale(undefined);
});

afterEach(cleanup);

describe('StartPage [ONB-1]', () => {
  it('renders the trio with starter badges and links', async () => {
    getStarterProblemsMock.mockResolvedValue([
      { id: 1, title_i18n: { en: 'Sum of Two Numbers' }, difficulty: 'EASY', status: 'APPROVED', statement_i18n: { en: 'Read two integers and print their sum.' } },
      { id: 5, title_i18n: { en: 'Sum 1..N' }, difficulty: 'EASY', status: 'APPROVED', statement_i18n: { en: 'Read n and print the sum.' } },
      { id: 9, title_i18n: { en: 'Maximum in Array' }, difficulty: 'EASY', status: 'APPROVED', statement_i18n: { en: 'Read an array and print its max.' } },
    ]);
    render(await StartPage());

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/first problem/i);
    expect(screen.getByText('STARTER 1')).toBeInTheDocument();
    expect(screen.getByText('STARTER 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sum of Two Numbers/ })).toHaveAttribute('href', '/problems/1');
    expect(screen.getByRole('link', { name: /Sum 1..N/ })).toHaveAttribute('href', '/problems/5');
    // The 3-step strip.
    expect(screen.getByText('Pick a starter')).toBeInTheDocument();
    expect(screen.getByText('Get judged, learn')).toBeInTheDocument();
  });

  it('shows the honest empty state when no starters exist', async () => {
    getStarterProblemsMock.mockResolvedValue([]);
    render(await StartPage());
    expect(screen.getByText(/No starters yet/i)).toBeInTheDocument();
  });

  it('surfaces load failures as an alert, not an empty masquerade', async () => {
    getStarterProblemsMock.mockRejectedValue(new Error('backend down'));
    render(await StartPage());
    expect(screen.getByRole('alert')).toHaveTextContent(/backend down/);
  });
});
