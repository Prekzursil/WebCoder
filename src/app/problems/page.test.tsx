import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { cookies } from 'next/headers';
import { ProblemType } from '@/types';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('./_lib/problems-api', () => ({
  getProblems: vi.fn(),
}));

import ProblemsListPage, { generateMetadata } from './page';
import { getProblems } from './_lib/problems-api';

function mockLocale(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === 'i18nextLng' ? (value === undefined ? undefined : { value }) : undefined,
  } as Awaited<ReturnType<typeof cookies>>);
}

function problem(partial: Partial<ProblemType>): ProblemType {
  return {
    id: 1,
    title_i18n: { en: 'Problem' },
    difficulty: 'EASY',
    status: 'APPROVED',
    ...partial,
  } as ProblemType;
}

afterEach(cleanup);

beforeEach(() => {
  mockLocale(undefined);
  vi.mocked(getProblems).mockReset();
});

describe('ProblemsListPage (route "/problems")', () => {
  it('renders the header and one localized link per problem', async () => {
    vi.mocked(getProblems).mockResolvedValue([
      problem({ id: 1, title_i18n: { en: 'Two Sum' } }),
      problem({ id: 2, title_i18n: { en: 'N-Queens' }, difficulty: 'HARD', status: 'PENDING_APPROVAL' }),
    ]);
    render(await ProblemsListPage());

    expect(screen.getByRole('heading', { name: 'Problems' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Two Sum' });
    expect(link.getAttribute('href')).toBe('/problems/1');
    expect(screen.getByRole('link', { name: 'N-Queens' }).getAttribute('href')).toBe('/problems/2');

    // Difficulty/status labels have no dictionary entries — raw values, same as CRA.
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toBe('Two Sum - EASY (APPROVED)');
    expect(items[1].textContent).toBe('N-Queens - HARD (PENDING_APPROVAL)');
  });

  it('resolves titles through the ro -> en -> "Problem ID: n" fallback chain', async () => {
    vi.mocked(getProblems).mockResolvedValue([
      problem({ id: 1, title_i18n: { en: 'English only', ro: 'Românesc' } }),
      problem({ id: 2, title_i18n: { en: 'English only' } }),
      problem({ id: 3, title_i18n: {} }),
    ]);
    mockLocale('ro');
    render(await ProblemsListPage());

    expect(screen.getByRole('link', { name: 'Românesc' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'English only' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Problem ID: 3' })).toBeInTheDocument();
  });

  it('renders the localized header for Romanian visitors', async () => {
    vi.mocked(getProblems).mockResolvedValue([]);
    mockLocale('ro');
    render(await ProblemsListPage());

    expect(screen.getByRole('heading', { name: 'Probleme' })).toBeInTheDocument();
  });

  it('renders the empty state when the catalog has no problems', async () => {
    vi.mocked(getProblems).mockResolvedValue([]);
    render(await ProblemsListPage());

    expect(screen.getByText('No problems available at the moment.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('propagates fetch failures to the error boundary (red paragraph path)', async () => {
    vi.mocked(getProblems).mockRejectedValue(new Error('Failed to load problems.'));
    await expect(ProblemsListPage()).rejects.toThrow('Failed to load problems.');
  });

  it('exposes catalog metadata', async () => {
    mockLocale(undefined);
    const metadata = await generateMetadata();
    expect(metadata.title).toBe('Problems');
    expect(metadata.description).toMatch(/problem catalog/i);
  });

  it('localizes the metadata title for Romanian visitors', async () => {
    mockLocale('ro');
    const metadata = await generateMetadata();
    expect(metadata.title).toBe('Probleme');
  });
});
