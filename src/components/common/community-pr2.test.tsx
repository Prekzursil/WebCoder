import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import AnnouncementPanel from './AnnouncementPanel';
import FollowButton from './FollowButton';
import EditorialEtiquetteBanner from '../../app/problems/[problemId]/EditorialEtiquetteBanner';
import type { User } from '@/types';

// COM-6 announcements panel · COM-4 follow toggle · EDT-5 etiquette banner.

const api = vi.hoisted(() => ({
  getThreads: vi.fn(),
  toggleByUsername: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  ForumService: api,
  FollowService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 7, username: 'me', email: 'm@x.com', role: 'BASIC' } as
      | User
      | null,
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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

const ANNOUNCEMENT = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 9,
      title: 'New: interactive problems',
      problem: null,
      author: 'admin',
      post_count: 1,
      is_pinned: true,
      is_locked: false,
      is_announcement: true,
      lang: 'en',
      last_activity: '2026-10-28T10:00:00Z',
      created_at: '2026-10-28T09:00:00Z',
    },
  ],
};

describe('AnnouncementPanel (COM-6)', () => {
  it('renders the announcements feed above the fold', async () => {
    api.getThreads.mockResolvedValue(ANNOUNCEMENT);
    render(<AnnouncementPanel />);
    await waitFor(() =>
      expect(screen.getByText('New: interactive problems')).toBeTruthy()
    );
    expect(api.getThreads).toHaveBeenCalledWith(
      expect.objectContaining({ announcements: true, pageSize: 3 })
    );
  });

  it('renders nothing when the feed is empty', async () => {
    api.getThreads.mockResolvedValue({ ...ANNOUNCEMENT, results: [] });
    const { container } = render(<AnnouncementPanel />);
    await waitFor(() => expect(api.getThreads).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="announcements-panel"]')).toBeNull();
  });
});

describe('FollowButton (COM-4)', () => {
  it('toggles follow by username', async () => {
    api.toggleByUsername.mockResolvedValue({ following: true, followers: 3 });
    render(<FollowButton username="someone" />);
    const btn = screen.getByTestId('follow-button');
    fireEvent.click(btn);
    await waitFor(() =>
      expect(api.toggleByUsername).toHaveBeenCalledWith('someone')
    );
    await waitFor(() => expect(screen.getByText(/unfollow/i)).toBeTruthy());
  });

  it('hides for the viewer own handle and anonymous visitors', () => {
    const { container } = render(<FollowButton username="me" />);
    expect(container.querySelector('[data-testid="follow-button"]')).toBeNull();
    mocks.auth.isAuthenticated = false;
    mocks.auth.user = null;
    const { container: anon } = render(<FollowButton username="someone" />);
    expect(anon.querySelector('[data-testid="follow-button"]')).toBeNull();
    mocks.auth.isAuthenticated = true;
    mocks.auth.user = { id: 7, username: 'me', email: 'm@x.com', role: 'BASIC' };
  });

  it('stays put when the toggle fails', async () => {
    api.toggleByUsername.mockRejectedValue(new Error('boom'));
    render(<FollowButton username="someone" />);
    fireEvent.click(screen.getByTestId('follow-button'));
    await waitFor(() => expect(api.toggleByUsername).toHaveBeenCalled());
    expect(screen.getByText(/follow/i).textContent).toBeTruthy();
  });
});

describe('EditorialEtiquetteBanner (EDT-5)', () => {
  it('states the anti-copy norm', () => {
    render(<EditorialEtiquetteBanner />);
    expect(screen.getByTestId('editorial-etiquette').textContent).toMatch(
      /only when stuck/i
    );
  });
});
