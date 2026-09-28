import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ProblemType, TestCaseType } from '@/types';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('../_lib/problems-api', () => ({
  getProblemDetail: vi.fn(),
}));

vi.mock('./SubmitSolutionForm', () => ({
  default: (props: { problemId: string; allowedLanguages: string[]; problemTitle: string }) => (
    <div
      data-testid="submit-form"
      data-problem-id={props.problemId}
      data-languages={props.allowedLanguages.join(',')}
      data-title={props.problemTitle}
    />
  ),
}));

import ProblemDetailPage, { generateMetadata } from './page';
import { getProblemDetail } from '../_lib/problems-api';

function mockLocale(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === 'i18nextLng' ? (value === undefined ? undefined : { value }) : undefined,
  } as Awaited<ReturnType<typeof cookies>>);
}

function testCase(partial: Partial<TestCaseType>): TestCaseType {
  return {
    input_data: '1 2',
    expected_output_data: '3',
    is_sample: false,
    points: 10,
    ...partial,
  } as TestCaseType;
}

function problem(partial: Partial<ProblemType>): ProblemType {
  return {
    id: 7,
    title_i18n: { en: 'Two Sum' },
    difficulty: 'MEDIUM',
    status: 'APPROVED',
    statement_i18n: { en: 'Add two numbers.\nPrint the sum.' },
    allowed_languages: ['python3', 'cpp17'],
    ...partial,
  } as ProblemType;
}

function pageProps(problemId = '7') {
  return { params: Promise.resolve({ problemId }) };
}

afterEach(cleanup);

beforeEach(() => {
  mockLocale(undefined);
  vi.mocked(getProblemDetail).mockReset();
  vi.mocked(notFound).mockClear();
});

describe('ProblemDetailPage (route "/problems/:problemId")', () => {
  it('renders the problem content server-side and mounts the client form island', async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(
      problem({
        test_cases: [
          testCase({ is_sample: true, input_data: '1 2', expected_output_data: '3' }),
          testCase({ is_sample: false, input_data: '9 9', expected_output_data: '18' }),
        ],
      })
    );
    render(await ProblemDetailPage(pageProps()));

    expect(screen.getByRole('heading', { name: 'Two Sum' })).toBeInTheDocument();
    expect(screen.getByText('MEDIUM')).toBeInTheDocument();
    const statement = screen.getByText(/Add two numbers\./);
    expect(statement.textContent).toBe('Add two numbers.\nPrint the sum.');

    // Only the sample test case is exposed.
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('18')).not.toBeInTheDocument();
    expect(screen.getByText('Sample Input 1:')).toBeInTheDocument();
    expect(screen.getByText('Sample Output 1:')).toBeInTheDocument();

    // The interactive submit surface is the client island, fed by the server.
    const form = screen.getByTestId('submit-form');
    expect(form.getAttribute('data-problem-id')).toBe('7');
    expect(form.getAttribute('data-languages')).toBe('python3,cpp17');
    expect(form.getAttribute('data-title')).toBe('Two Sum');
  });

  it('renders resource limits when present', async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(
      problem({ default_time_limit_ms: 1000, default_memory_limit_kb: 262144 })
    );
    render(await ProblemDetailPage(pageProps()));

    expect(screen.getByText('1000 ms')).toBeInTheDocument();
    expect(screen.getByText('262144 KB')).toBeInTheDocument();
  });

  it('omits the limits section when the problem carries none', async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(problem({}));
    render(await ProblemDetailPage(pageProps()));

    expect(screen.queryByText(/Time Limit/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Memory Limit/)).not.toBeInTheDocument();
  });

  it('hides the samples section when no test case is a sample', async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(
      problem({ test_cases: [testCase({ is_sample: false })] })
    );
    render(await ProblemDetailPage(pageProps()));

    expect(screen.queryByText(/Sample Test Cases/)).not.toBeInTheDocument();
  });

  it('resolves title and statement through the ro -> en fallback chain', async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(
      problem({
        title_i18n: { en: 'English title', ro: 'Titlu românesc' },
        statement_i18n: { en: 'English statement' },
      })
    );
    mockLocale('ro');
    render(await ProblemDetailPage(pageProps()));

    expect(screen.getByRole('heading', { name: 'Titlu românesc' })).toBeInTheDocument();
    expect(screen.getByText('English statement')).toBeInTheDocument();
    expect(screen.getByTestId('submit-form').getAttribute('data-title')).toBe(
      'Titlu românesc'
    );
  });

  it('falls back to "Problem ID: n" when no localized title exists', async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(problem({ title_i18n: {} }));
    render(await ProblemDetailPage(pageProps()));

    expect(screen.getByRole('heading', { name: 'Problem ID: 7' })).toBeInTheDocument();
  });

  it('renders an empty statement instead of undefined', async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(
      problem({ statement_i18n: undefined })
    );
    render(await ProblemDetailPage(pageProps()));

    const statements = screen
      .getAllByText((_, element) => element?.tagName === 'PRE')
      .filter((pre) => pre.textContent === '');
    expect(statements.length).toBeGreaterThan(0);
  });

  it('passes an empty language list to the form when the problem declares none', async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(problem({ allowed_languages: undefined }));
    render(await ProblemDetailPage(pageProps()));

    expect(screen.getByTestId('submit-form').getAttribute('data-languages')).toBe('');
  });

  it('answers a missing problem with notFound() (404, not a 200 message)', async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(null);

    await expect(ProblemDetailPage(pageProps())).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it('propagates API failures to the error boundary', async () => {
    vi.mocked(getProblemDetail).mockRejectedValue(new Error('Failed to load problem details.'));

    await expect(ProblemDetailPage(pageProps())).rejects.toThrow(
      'Failed to load problem details.'
    );
  });
});

describe('generateMetadata (problem detail)', () => {
  it('derives title and description from the localized problem content', async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(problem({}));

    const metadata = await generateMetadata(pageProps());

    expect(metadata.title).toBe('Two Sum');
    expect(metadata.description).toBe('Add two numbers. Print the sum.');
  });

  it('truncates long statements to 160 characters for the description', async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(
      problem({ statement_i18n: { en: 'x'.repeat(300) } })
    );

    const metadata = await generateMetadata(pageProps());

    expect((metadata.description ?? '').length).toBe(160);
  });

  it('uses a generic description when the statement is empty', async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(
      problem({ statement_i18n: undefined })
    );

    const metadata = await generateMetadata(pageProps());

    expect(metadata.description).toBe('Solve this problem on WebCoder.');
  });

  it('localizes the title for Romanian visitors', async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(
      problem({ title_i18n: { en: 'English title', ro: 'Titlu românesc' } })
    );
    mockLocale('ro');

    const metadata = await generateMetadata(pageProps());

    expect(metadata.title).toBe('Titlu românesc');
  });

  it('returns a not-found title when the problem does not exist', async () => {
    vi.mocked(getProblemDetail).mockResolvedValue(null);

    const metadata = await generateMetadata(pageProps('404'));

    expect(metadata.title).toBe('Problem not found.');
  });
});
