import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import ClassInsights from './ClassInsights';
import * as ApiService from '@/services/ApiService';

// [wave E items 22/43/44] The teacher's class-insights tabs: effort
// board with report-card links, failure heatmap with per-problem rates,
// and the batch member import.

vi.mock('@/services/ApiService', () => ({
  // [wave G item 82/88] the palette/onboarding surfaces need these.
  SearchService: { federated: vi.fn().mockResolvedValue({ query: '', results: {} }) },
  OnboardingService: { get: vi.fn().mockResolvedValue({ steps: [], done: 0, total: 0 }) },
  ClassroomService: {
    effortBoard: vi.fn(),
    failureHeatmap: vi.fn(),
    bulkAddMembers: vi.fn(),
    reportCardPdfUrl: (classroomId: number, studentId: number) =>
      `/api/v1/classroom/classes/${classroomId}/report-card/${studentId}/`,
  },
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { id: 1, username: 'teach', role: 'TEACHER' },
  }),
}));

const { ClassroomService } = ApiService as unknown as {
  ClassroomService: {
    effortBoard: ReturnType<typeof vi.fn>;
    failureHeatmap: ReturnType<typeof vi.fn>;
    bulkAddMembers: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  ClassroomService.effortBoard.mockReset().mockResolvedValue({
    count: 2,
    results: [
      {
        rank: 1,
        user_id: 5,
        username: 'grinder',
        attempts: 12,
        active_days: 4,
        problems_solved: 1,
      },
      { rank: 2, user_id: 6, username: 'acer', attempts: 2, active_days: 1, problems_solved: 2 },
    ],
  });
  ClassroomService.failureHeatmap.mockReset().mockResolvedValue({
    count: 1,
    assignments: [
      {
        assignment_id: 9,
        title_i18n: { en: 'HW1' },
        problems: [
          { problem_id: 1, label: 'A', points: 100 },
          { problem_id: 2, label: 'B', points: 100 },
        ],
        students: [
          {
            user_id: 5,
            username: 'grinder',
            cells: [
              { intensity: 0.5, attempts: 3 },
              { intensity: null, attempts: 0 },
            ],
          },
        ],
        failure_rates: [
          { label: 'A', failure_rate: 0.5 },
          { label: 'B', failure_rate: 1.0 },
        ],
      },
    ],
  });
  ClassroomService.bulkAddMembers.mockReset();
});
afterEach(cleanup);

describe('ClassInsights', () => {
  it('renders the effort board with report-card links', async () => {
    render(<ClassInsights classroomId={3} />);
    await waitFor(() => {
      expect(screen.getByTestId('effort-grinder')).toBeTruthy();
    });
    const link = screen.getByTestId('report-card-grinder');
    expect(link.getAttribute('href')).toBe('/api/v1/classroom/classes/3/report-card/5/');
  });

  it('renders the heatmap with failure-rate row', async () => {
    render(<ClassInsights classroomId={3} />);
    fireEvent.click(screen.getByRole('button', { name: /heatmap/i }));
    await waitFor(() => {
      expect(screen.getByTestId('heat-grinder')).toBeTruthy();
    });
    expect(screen.getByTestId('failrate-A').textContent).toBe('50');
    expect(screen.getByTestId('failrate-B').textContent).toBe('100');
  });

  it('imports members and reports the outcome', async () => {
    ClassroomService.bulkAddMembers.mockResolvedValue({
      added: 2,
      already_members: 1,
      missing: ['ghost'],
    });
    render(<ClassInsights classroomId={3} />);
    fireEvent.click(screen.getByRole('button', { name: /import/i }));
    const box = screen.getByLabelText(/usernames/i);
    fireEvent.change(box, { target: { value: 'a, b, c' } });
    fireEvent.click(screen.getByRole('button', { name: /enroll/i }));
    await waitFor(() => {
      expect(ClassroomService.bulkAddMembers).toHaveBeenCalledWith(3, ['a', 'b', 'c']);
    });
    await waitFor(() => {
      expect(screen.getByTestId('import-result').textContent).toContain('ghost');
    });
  });
});
