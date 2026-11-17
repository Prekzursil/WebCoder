import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import LearningPage from './page';
import * as ApiService from '@/services/ApiService';

// [wave E items 29/30/33/34/35] The learning hub renders its five
// surfaces from the engine endpoints; the theory deck flips in place.

vi.mock('@/services/ApiService', () => ({
  LearningService: {
    reviewQueue: vi.fn(),
    practicePlan: vi.fn(),
    mistakeProfile: vi.fn(),
    skills: vi.fn(),
    theory: vi.fn(),
  },
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: 1, username: 'u', role: 'BASIC' } }),
}));

const { LearningService } = ApiService as unknown as {
  LearningService: {
    reviewQueue: ReturnType<typeof vi.fn>;
    practicePlan: ReturnType<typeof vi.fn>;
    mistakeProfile: ReturnType<typeof vi.fn>;
    skills: ReturnType<typeof vi.fn>;
    theory: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  LearningService.reviewQueue.mockReset().mockResolvedValue({
    count: 1,
    due: 1,
    results: [
      {
        problem_id: 3,
        title_i18n: { en: 'Sort Three Values' },
        difficulty: 'EASY',
        attempts: 2,
        misses: 2,
        stage: 2,
        interval_days: 3,
        due_at: new Date(Date.now() - 86_400_000).toISOString(),
        due: true,
      },
    ],
  });
  LearningService.practicePlan.mockReset().mockResolvedValue({
    due_reviews: 1,
    days: [
      {
        date: '2026-11-18',
        kind: 'review',
        problem_id: 3,
        title_i18n: { en: 'Sort Three Values' },
        focus_tag: null,
      },
      { date: '2026-11-19', kind: null, problem_id: null, title_i18n: null, focus_tag: null },
    ],
  });
  LearningService.mistakeProfile.mockReset().mockResolvedValue({
    total_submissions: 4,
    summary: '4 submissions, 1 accepted (25% AC rate).',
    verdict_counts: { WA: 3, AC: 1 },
    patterns: [
      {
        pattern: 'EDGE_CASES',
        evidence: '2/3 WA submissions pass every sample but fail hidden tests.',
        hint_en: 'Probe the extremes.',
        hint_ro: 'Verifică extreme.',
      },
    ],
  });
  LearningService.skills.mockReset().mockResolvedValue({
    count: 2,
    edges: [{ from: 'loops', to: 'arrays' }],
    suggestion: [],
    nodes: [
      {
        slug: 'loops',
        name_i18n: { en: 'Loops' },
        prerequisites: [],
        unlocked: true,
        solved: 2,
        attempted: 3,
        points: 6,
      },
      {
        slug: 'arrays',
        name_i18n: { en: 'Arrays' },
        prerequisites: ['loops'],
        unlocked: false,
        solved: 0,
        attempted: 0,
        points: 0,
      },
    ],
  });
  LearningService.theory.mockReset().mockResolvedValue({
    count: 1,
    results: [
      {
        id: 9,
        tag: 'binary-search',
        front_en: 'What must hold?',
        back_en: 'Monotonicity.',
        front_ro: 'F?',
        back_ro: 'M.',
      },
    ],
  });
});

afterEach(cleanup);

describe('LearningPage', () => {
  it('renders the review queue, plan, mistake profile and skill graph', async () => {
    render(<LearningPage />);
    await waitFor(() => {
      expect(screen.getByTestId('review-queue')).toBeTruthy();
    });
    expect(screen.getByTestId('review-queue').textContent).toContain('Sort Three Values');
    expect(screen.getByTestId('review-queue').textContent).toContain('1 due');
    expect(screen.getByTestId('practice-plan').textContent).toContain('rest');
    expect(screen.getByTestId('mistake-profile').textContent).toContain('25% AC rate');
    expect(screen.getByTestId('mistake-profile').textContent).toContain('Probe the extremes.');
    const graph = screen.getByTestId('skill-graph').textContent ?? '';
    expect(graph).toContain('Loops');
    expect(graph).toContain('Arrays');
  });

  it('flips theory cards in place', async () => {
    render(<LearningPage />);
    await waitFor(() => {
      expect(screen.getByTestId('theory-card-9')).toBeTruthy();
    });
    expect(screen.getByTestId('theory-card-9').textContent).toContain('What must hold?');
    fireEvent.click(screen.getByTestId('theory-card-9'));
    expect(screen.getByTestId('theory-card-9').textContent).toContain('Monotonicity.');
  });

  it('shows the empty review state', async () => {
    LearningService.reviewQueue.mockResolvedValue({ count: 0, due: 0, results: [] });
    render(<LearningPage />);
    await waitFor(() => {
      expect(screen.getByText(/Nothing to review/i)).toBeTruthy();
    });
  });
});
