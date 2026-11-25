import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import CoursesPage from './page';
import * as ApiService from '@/services/ApiService';

// [wave E item 45] The courses page: the catalog with progress, the
// lesson sequence with a flippable theory card, drills and problems.

vi.mock('@/services/ApiService', () => ({
  // [wave G item 82/88] the palette/onboarding surfaces need these.
  SearchService: { federated: vi.fn().mockResolvedValue({ query: '', results: {} }) },
  OnboardingService: { get: vi.fn().mockResolvedValue({ steps: [], done: 0, total: 0 }) },
  LearningService: { courses: vi.fn(), course: vi.fn() },
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: 1, username: 'u', role: 'BASIC' } }),
}));

const { LearningService } = ApiService as unknown as {
  LearningService: {
    courses: ReturnType<typeof vi.fn>;
    course: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  LearningService.courses.mockReset().mockResolvedValue({
    count: 1,
    results: [
      {
        slug: 'scratch-to-python',
        title_i18n: { en: 'From blocks to Python' },
        description_i18n: { en: 'Six lessons.' },
        lesson_count: 6,
        problem_count: 9,
        solved_count: 2,
      },
    ],
  });
  LearningService.course.mockReset().mockResolvedValue({
    slug: 'scratch-to-python',
    title_i18n: { en: 'From blocks to Python' },
    description_i18n: { en: 'Six lessons.' },
    lessons: [
      {
        id: 1,
        order: 1,
        title_i18n: { en: 'Say hello (print)' },
        theory: {
          front_en: 'Three parts of every program?',
          back_en: 'Read, compute, print.',
          front_ro: 'F?',
          back_ro: 'B?',
        },
        drills: [{ id: 4, kind: 'READ_CODE' }],
        problems: [
          { id: 11, title_i18n: { en: 'Hello, Judge!' }, difficulty: 'VERY_EASY', is_solved: true },
        ],
        solved_count: 1,
      },
      {
        id: 2,
        order: 2,
        title_i18n: { en: 'Read input' },
        theory: null,
        drills: [],
        problems: [
          {
            id: 12,
            title_i18n: { en: 'Greet a Friend' },
            difficulty: 'VERY_EASY',
            is_solved: false,
          },
        ],
        solved_count: 0,
      },
    ],
  });
});
afterEach(cleanup);

describe('CoursesPage', () => {
  it('lists courses with progress and opens the lesson sequence', async () => {
    render(<CoursesPage />);
    await waitFor(() => {
      expect(screen.getByTestId('courses-list')).toBeTruthy();
    });
    expect(screen.getByText('From blocks to Python')).toBeTruthy();
    expect(screen.getByText(/2\/9 solved/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId('course-scratch-to-python'));
    await waitFor(() => {
      expect(screen.getByTestId('course-detail')).toBeTruthy();
    });
    expect(screen.getByTestId('lesson-1')).toBeTruthy();
    expect(screen.getByTestId('lesson-1').textContent).toContain('Hello, Judge!');
    expect(screen.getByTestId('lesson-1').textContent).toContain('✓');
  });

  it('flips the theory card in place', async () => {
    render(<CoursesPage />);
    const opener = await screen.findByTestId('course-scratch-to-python');
    fireEvent.click(opener);
    await waitFor(() => {
      expect(screen.getByTestId('lesson-1')).toBeTruthy();
    });
    expect(screen.getByText('Three parts of every program?')).toBeTruthy();
    fireEvent.click(screen.getByText('Three parts of every program?'));
    expect(screen.getByText('Read, compute, print.')).toBeTruthy();
  });

  it('shows the empty state', async () => {
    LearningService.courses.mockResolvedValue({ count: 0, results: [] });
    render(<CoursesPage />);
    await waitFor(() => {
      expect(screen.getByText(/No courses yet/i)).toBeTruthy();
    });
  });
});
