import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import CommentaryPanel from './CommentaryPanel';
import HacksPanel from './HacksPanel';

// Wave F items 48 + 56 — the commentary broadcast feed and the open-hacks
// phase (lock-to-hack, target reading, counter-test submit, public feed).

const api = vi.hoisted(() => ({
  getCommentary: vi.fn(),
  postCommentary: vi.fn(),
  getHacks: vi.fn(),
  getHackTargets: vi.fn(),
  lockProblem: vi.fn(),
  submitHack: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  // [wave G item 82/88] the palette/onboarding surfaces need these.
  SearchService: { federated: vi.fn().mockResolvedValue({ query: '', results: {} }) },
  OnboardingService: { get: vi.fn().mockResolvedValue({ steps: [], done: 0, total: 0 }) },
  ContestService: api,
}));

const PROBLEMS = [
  {
    id: 11,
    problem: 1,
    problem_title: { en: 'Sum' },
    problem_difficulty: 'EASY',
    order: 0,
    label: 'A',
    points: 100,
  },
];

const HACKS_FEED = {
  count: 1,
  window_open: true,
  results: [
    {
      id: 5,
      contest: 1,
      problem_label: 'A',
      hacker: 7,
      hacker_username: 'alice',
      target_id: 9,
      target_username: 'bob',
      input_data: '2',
      verdict: 'SUCCESSFUL',
      feedback: 'Wrong answer on the hack input.',
      judged_at: '2026-11-01T10:00:00Z',
      created_at: '2026-11-01T09:58:00Z',
    },
  ],
};

const TARGETS = {
  count: 1,
  results: [
    {
      id: 9,
      user: { username: 'bob' },
      problem_id: 1,
      problem_label: 'A',
      language: 'python3',
      verdict: 'AC',
      score: 100,
      code: 'print(int(input()) + 1)',
      submission_time: '2026-11-01T09:40:00Z',
    },
  ],
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  api.getCommentary.mockReset();
  api.postCommentary.mockReset();
  api.getHacks.mockReset().mockResolvedValue(HACKS_FEED);
  api.getHackTargets.mockReset().mockResolvedValue(TARGETS);
  api.lockProblem.mockReset();
  api.submitHack.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('CommentaryPanel (item 56)', () => {
  it('lists commentary lines with minute offsets', async () => {
    api.getCommentary.mockResolvedValue({
      count: 2,
      results: [
        {
          id: 1,
          author: 2,
          author_username: 'organizer',
          minute_offset: 5,
          text: 'Problem A hides a two-pointer trick.',
          created_at: '2026-11-01T10:05:00Z',
        },
        {
          id: 2,
          author: 2,
          author_username: 'organizer',
          minute_offset: 30,
          text: 'We found a bug in B tests — stay tuned.',
          created_at: '2026-11-01T10:30:00Z',
        },
      ],
    });
    render(<CommentaryPanel contestId={1} canManage={false} />);
    await waitFor(() =>
      expect(screen.getByText('Problem A hides a two-pointer trick.')).toBeTruthy(),
    );
    expect(screen.getByText('+5m')).toBeTruthy();
    expect(screen.queryByTestId('commentary-input')).toBeNull();
  });

  it('organizers post a line', async () => {
    api.getCommentary.mockResolvedValue({ count: 0, results: [] });
    api.postCommentary.mockResolvedValue({});
    render(<CommentaryPanel contestId={1} canManage />);
    const input = await screen.findByTestId('commentary-input');
    fireEvent.change(input, { target: { value: 'Watch out for n=1.' } });
    fireEvent.click(screen.getByTestId('commentary-post'));
    await waitFor(() => expect(api.postCommentary).toHaveBeenCalledWith(1, 'Watch out for n=1.'));
  });

  it('surfaces load errors', async () => {
    api.getCommentary.mockRejectedValue(new Error('boom'));
    render(<CommentaryPanel contestId={1} canManage={false} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('boom'));
  });
});

describe('HacksPanel (item 48)', () => {
  it('shows the window state, lock buttons, targets and the feed', async () => {
    render(<HacksPanel contestId={1} problems={PROBLEMS} />);
    expect(await screen.findByText(/Hacking window is OPEN/i, { exact: false })).toBeTruthy();
    expect(screen.getByTestId('hack-lock-A')).toBeTruthy();
    expect(screen.getByText('bob')).toBeTruthy();
    expect(screen.getByTestId('hack-row-5').textContent).toContain('SUCCESSFUL');
  });

  it('locks a problem and reloads', async () => {
    api.lockProblem.mockResolvedValue({ detail: 'Locked' });
    render(<HacksPanel contestId={1} problems={PROBLEMS} />);
    await screen.findByTestId('hack-lock-A');
    fireEvent.click(screen.getByTestId('hack-lock-A'));
    await waitFor(() => expect(api.lockProblem).toHaveBeenCalledWith(1, 11));
    await waitFor(() => expect(screen.getByTestId('hack-message').textContent).toContain('Locked'));
  });

  it('reads a target solution and submits a counter-test', async () => {
    api.submitHack.mockResolvedValue({
      ...HACKS_FEED.results[0],
      verdict: 'UNSUCCESSFUL',
      feedback: 'The target solution survives this input.',
    });
    render(<HacksPanel contestId={1} problems={PROBLEMS} />);
    await screen.findByTestId('hack-target-9');
    fireEvent.click(screen.getByTestId('hack-target-9'));
    expect(screen.getByTestId('hack-code-9').textContent).toContain('int(input())');
    fireEvent.change(screen.getByTestId('hack-input'), { target: { value: '99' } });
    fireEvent.click(screen.getByTestId('hack-submit'));
    await waitFor(() => expect(api.submitHack).toHaveBeenCalledWith(1, 9, '99'));
    await waitFor(() =>
      expect(screen.getByTestId('hack-message').textContent).toContain('UNSUCCESSFUL'),
    );
  });

  it('reports lock failures without crashing', async () => {
    api.lockProblem.mockRejectedValue(new Error('Lock a problem only after fully solving it.'));
    render(<HacksPanel contestId={1} problems={PROBLEMS} />);
    await screen.findByTestId('hack-lock-A');
    fireEvent.click(screen.getByTestId('hack-lock-A'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('fully solving'));
  });
});
