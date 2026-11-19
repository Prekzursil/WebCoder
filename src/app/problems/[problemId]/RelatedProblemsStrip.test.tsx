import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import RelatedProblemsStrip from './RelatedProblemsStrip';

// Matrix row 6 — the similar-problems strip: shared-tag rows link to the
// problems; empty results render nothing.

const api = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('@/services/ApiService', () => ({
  // [wave G item 82/88] the palette/onboarding surfaces need these.
  SearchService: { federated: vi.fn().mockResolvedValue({ query: '', results: {} }) },
  OnboardingService: { get: vi.fn().mockResolvedValue({ steps: [], done: 0, total: 0 }) },
  RelatedProblemService: api,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('RelatedProblemsStrip', () => {
  it('renders related problems with links and difficulty chips', async () => {
    api.list.mockResolvedValue({
      count: 2,
      results: [
        {
          id: 7,
          title_i18n: { en: 'Pair sum', ro: 'Suma pereche' },
          difficulty: 'EASY',
          shared_tags: 2,
        },
        {
          id: 9,
          title_i18n: { en: 'Set lookup', ro: 'Căutare în set' },
          difficulty: 'HARD',
          shared_tags: 1,
        },
      ],
    });
    render(<RelatedProblemsStrip problemId={1} />);

    expect(await screen.findByTestId('related-problems')).toBeVisible();
    expect(screen.getByRole('link', { name: /pair sum/i })).toHaveAttribute('href', '/problems/7');
    expect(screen.getByRole('link', { name: /set lookup/i })).toHaveAttribute(
      'href',
      '/problems/9',
    );
    expect(screen.getByText('EASY')).toBeInTheDocument();
  });

  it('renders nothing when there are no related problems', async () => {
    api.list.mockResolvedValue({ count: 0, results: [] });
    const { container } = render(<RelatedProblemsStrip problemId={1} />);

    await screen.findByText('Similar problems').catch(() => null);
    expect(container.querySelector('[data-testid="related-problems"]')).toBeNull();
  });

  it('swallows fetch errors as an empty strip', async () => {
    api.list.mockRejectedValue(new Error('boom'));
    const { container } = render(<RelatedProblemsStrip problemId={1} />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector('[data-testid="related-problems"]')).toBeNull();
  });
});
