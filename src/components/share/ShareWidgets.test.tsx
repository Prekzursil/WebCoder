import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import SetterCvPage from '@/app/setters/[username]/page';
import { ProblemEmbedWidget, SolveCardShare } from '@/components/share/ShareWidgets';
import type { User } from '@/types';

// Wave F items 70-72 — the setter CV page, the shareable solve card and
// the embeddable problem widget.

const api = vi.hoisted(() => ({
  getSetterCV: vi.fn(),
  saveSetterCV: vi.fn(),
  getEmbedProblem: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  // [wave G item 82/88] the palette/onboarding surfaces need these.
  SearchService: { federated: vi.fn().mockResolvedValue({ query: '', results: {} }) },
  OnboardingService: { get: vi.fn().mockResolvedValue({ steps: [], done: 0, total: 0 }) },
  CommunityService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 1, username: 'tester', email: 't@x.com', role: 'BASIC' } as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
  AuthContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    Consumer: ({ children }: { children: (value: unknown) => React.ReactNode }) =>
      children(mocks.auth),
    _currentValue: mocks.auth,
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ username: 'guru' }),
}));

beforeEach(() => {
  api.getSetterCV.mockReset();
  api.saveSetterCV.mockReset();
  api.getEmbedProblem.mockReset();
});

afterEach(() => cleanup());

const CV = {
  username: 'guru',
  blurb: 'Olympiad setter since 2019.',
  links: ['https://guru.dev'],
  problems_approved: 12,
  problems_by_difficulty: { EASY: 4, MEDIUM: 6, HARD: 2 },
  community_editorials: 3,
  articles: 1,
  contests_contributed: 2,
  member_since: '2026-01-01T00:00:00Z',
};

describe('SetterCvPage (item 70)', () => {
  it('renders the derived portfolio and profile', async () => {
    api.getSetterCV.mockResolvedValue(CV);
    render(<SetterCvPage />);
    const summary = await screen.findByTestId('setter-cv-summary');
    expect(summary.textContent).toContain('12');
    expect(screen.getByTestId('setter-difficulty-HARD').textContent).toContain('2');
    expect(screen.getByTestId('setter-blurb').textContent).toContain('2019');
    expect(screen.getByTestId('setter-links').textContent).toContain('guru.dev');
  });

  it('owners edit the blurb and links', async () => {
    mocks.auth.user = { id: 9, username: 'guru', email: 'g@x.com', role: 'BASIC' };
    api.getSetterCV.mockResolvedValue(CV);
    api.saveSetterCV.mockResolvedValue({ ...CV, blurb: 'New blurb' });
    render(<SetterCvPage />);
    await screen.findByTestId('setter-edit-button');
    fireEvent.click(screen.getByTestId('setter-edit-button'));
    fireEvent.change(screen.getByTestId('setter-blurb-input'), {
      target: { value: 'New blurb' },
    });
    fireEvent.click(screen.getByTestId('setter-save'));
    await waitFor(() =>
      expect(api.saveSetterCV).toHaveBeenCalledWith('guru', {
        blurb: 'New blurb',
        links: ['https://guru.dev'],
      }),
    );
  });

  it('non-owners see no edit button', async () => {
    mocks.auth.user = { id: 2, username: 'someone', email: 's@x.com', role: 'BASIC' };
    api.getSetterCV.mockResolvedValue(CV);
    render(<SetterCvPage />);
    await screen.findByTestId('setter-cv-summary');
    expect(screen.queryByTestId('setter-edit-button')).toBeNull();
    mocks.auth.user = { id: 1, username: 'tester', email: 't@x.com', role: 'BASIC' };
  });

  it('surfaces load errors', async () => {
    api.getSetterCV.mockRejectedValue(new Error('nope'));
    render(<SetterCvPage />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('nope'));
  });
});

describe('SolveCardShare (item 71)', () => {
  it('renders the SVG card image and copies the link', async () => {
    render(<SolveCardShare username="tester" problemId={5} />);
    const image = screen.getByTestId('solve-card-image');
    expect(image.getAttribute('src')).toContain('/cards/solve/tester/5/svg/');
    fireEvent.click(screen.getByTestId('solve-card-copy'));
    await waitFor(() => expect(screen.getByTestId('solve-card-copy').textContent).not.toBe(''));
  });
});

describe('ProblemEmbedWidget (item 72)', () => {
  it('renders title, samples, solve count and CTA', async () => {
    api.getEmbedProblem.mockResolvedValue({
      problem_id: 5,
      title: 'Two Sum',
      difficulty: 'EASY',
      time_limit_ms: 1000,
      memory_limit_kb: 262144,
      samples: [{ input_data: '2 7', expected_output_data: '0 1' }],
      solved_by: 42,
      solve_url: '/problems/5',
    });
    render(<ProblemEmbedWidget problemId={5} />);
    const widget = await screen.findByTestId('problem-embed');
    expect(widget.textContent).toContain('Two Sum');
    expect(widget.textContent).toContain('42');
    expect(screen.getByTestId('embed-samples').textContent).toContain('0 1');
    expect(screen.getByTestId('embed-cta').getAttribute('href')).toBe('/problems/5');
  });

  it('shows the not-embeddable error', async () => {
    api.getEmbedProblem.mockRejectedValue(new Error('This problem is not embeddable right now.'));
    render(<ProblemEmbedWidget problemId={7} />);
    const error = await screen.findByTestId('embed-error');
    expect(error.textContent).toContain('not embeddable');
  });
});
