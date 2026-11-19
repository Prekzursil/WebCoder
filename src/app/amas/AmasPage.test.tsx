import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import AmasPage from '@/app/amas/page';
import AmaSessionPage from '@/app/amas/[sessionId]/page';
import { AmaHub, ProblemRequestBoard, ReputationCard } from '@/app/amas/AmaComponents';
import type { User } from '@/types';

// Wave F items 66/68/69 — the reputation card, the AMA hub/session and
// the problem-request board.

const api = vi.hoisted(() => ({
  getMyReputation: vi.fn(),
  getReputationTiers: vi.fn(),
  getAmas: vi.fn(),
  getAma: vi.fn(),
  askAmaQuestion: vi.fn(),
  answerAmaQuestion: vi.fn(),
  upvoteAmaQuestion: vi.fn(),
  getProblemRequests: vi.fn(),
  createProblemRequest: vi.fn(),
  voteProblemRequest: vi.fn(),
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
  useParams: () => ({ sessionId: '7' }),
}));

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
});

afterEach(() => cleanup());

describe('ReputationCard (item 66)', () => {
  it('renders tier, honor, next tier and privileges', async () => {
    api.getMyReputation.mockResolvedValue({
      honor: 30,
      breakdown: { approved_problem: 3 },
      tier: 'Contributor',
      next_tier: { name: 'Trusted', honor_needed: 70 },
      privileges: ['blog_publish', 'wiki_edit'],
      tiers: [{ name: 'Newcomer', min_honor: 0 }],
    });
    render(<ReputationCard />);
    const card = await screen.findByTestId('reputation-card');
    expect(card.textContent).toContain('Contributor');
    expect(card.textContent).toContain('30');
    expect(card.textContent).toContain('70 honor to Trusted');
    expect(card.textContent).toContain('blog_publish');
  });

  it('hidden for anonymous callers', () => {
    mocks.auth.isAuthenticated = false;
    const { container } = render(<ReputationCard />);
    expect(container.textContent).toBe('');
    mocks.auth.isAuthenticated = true;
  });
});

describe('AmaHub (item 68)', () => {
  it('lists sessions with live badges', async () => {
    api.getAmas.mockResolvedValue({
      count: 2,
      results: [
        {
          id: 7,
          host: 'guru',
          title: 'Ask me about ONI',
          status: 'LIVE',
          starts_at: '2026-11-10T18:00:00Z',
        },
        {
          id: 8,
          host: 'medalist',
          title: 'IOI stories',
          status: 'CLOSED',
          starts_at: '2026-10-01T18:00:00Z',
        },
      ],
    });
    render(<AmaHub />);
    expect(await screen.findByTestId('ama-row-7')).toBeTruthy();
    expect(screen.getByTestId('ama-row-7').textContent).toContain('LIVE');
    expect(screen.getByTestId('ama-row-8').textContent).toContain('CLOSED');
  });

  it('empty state invites Mentor-tier hosts', async () => {
    api.getAmas.mockResolvedValue({ count: 0, results: [] });
    render(<AmaHub />);
    await waitFor(() =>
      expect(screen.getByText(/No sessions yet/i, { exact: false })).toBeTruthy(),
    );
  });
});

describe('AmaSessionPage (item 68)', () => {
  it('asks a question, upvotes, and the host answers', async () => {
    mocks.auth.user = { id: 2, username: 'guru', email: 'g@x.com', role: 'BASIC' };
    api.getAma.mockResolvedValue({
      id: 7,
      host: 'guru',
      title: 'Ask me about ONI',
      status: 'LIVE',
      starts_at: '2026-11-10T18:00:00Z',
      ends_at: '2026-11-10T20:00:00Z',
      description: '3 medals',
      questions: [
        {
          id: 11,
          author: 'tester',
          question: 'How to train?',
          answer: '',
          answered_at: null,
          upvotes: 2,
        },
      ],
    });
    api.upvoteAmaQuestion.mockResolvedValue({ upvotes: 3, voted: true });
    api.answerAmaQuestion.mockResolvedValue({ id: 11, answer: 'Drills.' });
    render(<AmaSessionPage />);
    await screen.findByTestId('ama-question-11');
    fireEvent.click(screen.getByTestId('ama-upvote-11'));
    await waitFor(() => expect(api.upvoteAmaQuestion).toHaveBeenCalledWith(11));
    fireEvent.change(screen.getByTestId('ama-answer-input-11'), {
      target: { value: 'Drills.' },
    });
    fireEvent.click(screen.getByTestId('ama-answer-submit-11'));
    await waitFor(() => expect(api.answerAmaQuestion).toHaveBeenCalledWith(11, 'Drills.'));
    mocks.auth.user = { id: 1, username: 'tester', email: 't@x.com', role: 'BASIC' };
  });

  it('non-hosts do not see answer inputs', async () => {
    api.getAma.mockResolvedValue({
      id: 7,
      host: 'guru',
      title: 'AMA',
      status: 'LIVE',
      starts_at: '2026-11-10T18:00:00Z',
      ends_at: '2026-11-10T20:00:00Z',
      description: 'd',
      questions: [
        { id: 11, author: 'tester', question: 'q', answer: '', answered_at: null, upvotes: 0 },
      ],
    });
    render(<AmaSessionPage />);
    await screen.findByTestId('ama-question-11');
    expect(screen.queryByTestId('ama-answer-input-11')).toBeNull();
  });
});

describe('ProblemRequestBoard (item 69)', () => {
  it('lists requests, votes, and opens new ones', async () => {
    api.getProblemRequests.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 5,
          requester: 3,
          requester_username: 'bob',
          title: 'More graph problems',
          description: 'Please!',
          status: 'OPEN',
          fulfilled_problem: null,
          fulfilled_problem_title: null,
          vote_count: 4,
          created_at: '2026-11-01T10:00:00Z',
        },
      ],
    });
    api.voteProblemRequest.mockResolvedValue({ votes: 5, voted: true });
    api.createProblemRequest.mockResolvedValue({});
    render(<ProblemRequestBoard />);
    const row = await screen.findByTestId('request-row-5');
    expect(row.textContent).toContain('More graph problems');
    expect(row.textContent).toContain('OPEN');
    fireEvent.click(screen.getByTestId('request-vote-5'));
    await waitFor(() => expect(api.voteProblemRequest).toHaveBeenCalledWith(5));
    fireEvent.change(screen.getByTestId('request-title-input'), {
      target: { value: 'DP on trees' },
    });
    fireEvent.change(screen.getByTestId('request-description-input'), {
      target: { value: 'A full chapter please' },
    });
    fireEvent.click(screen.getByTestId('request-submit'));
    await waitFor(() =>
      expect(api.createProblemRequest).toHaveBeenCalledWith({
        title: 'DP on trees',
        description: 'A full chapter please',
      }),
    );
  });
});

describe('AmasPage composition', () => {
  it('renders hub + board together', async () => {
    api.getMyReputation.mockResolvedValue({
      honor: 0,
      breakdown: {},
      tier: 'Newcomer',
      next_tier: { name: 'Contributor', honor_needed: 25 },
      privileges: ['wiki_edit'],
      tiers: [],
    });
    api.getAmas.mockResolvedValue({ count: 0, results: [] });
    api.getProblemRequests.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    render(<AmasPage />);
    await screen.findByTestId('ama-hub');
    expect(screen.getByTestId('problem-request-board')).toBeTruthy();
  });
});
