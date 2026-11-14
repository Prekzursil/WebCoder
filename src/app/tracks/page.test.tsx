import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import TracksPage from './page';
import type { User } from '@/types';

// X12 — the study-tracks hub: rows with counts + progress, empty/error
// states, and the curator form gated to CREATOR/TEACHER roles.

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));

vi.mock('@/services/ApiService', () => ({
  TrackService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 7, username: 'bob', email: 'b@x.com', role: 'BASIC_USER' } as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

const ROW = {
  slug: 'beginner-ladder',
  title_i18n: { en: 'Beginner ladder', ro: 'Scara începătorului' },
  description_i18n: { en: 'Start here.', ro: 'Începe aici.' },
  owner_username: 'creator',
  is_public: true,
  is_owner: false,
  item_count: 3,
  solved_count: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};

describe('TracksPage', () => {
  it('renders track cards with counts and an unlisted badge', async () => {
    api.list.mockResolvedValue({
      count: 2,
      results: [
        ROW,
        {
          ...ROW,
          slug: 'class-set',
          title_i18n: { en: 'Class set', ro: 'Setul clasei' },
          is_public: false,
          item_count: 5,
          solved_count: 1,
        },
      ],
    });
    render(<TracksPage />);

    expect(await screen.findByRole('link', { name: 'Beginner ladder' })).toBeInTheDocument();
    expect(screen.getByText(/3 problems/)).toBeInTheDocument();
    expect(screen.getByText(/unlisted/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create track/i })).not.toBeInTheDocument();
  });

  it('shows solved progress for signed-in viewers', async () => {
    api.list.mockResolvedValue({
      count: 1,
      results: [{ ...ROW, solved_count: 2 }],
    });
    render(<TracksPage />);

    await screen.findByRole('link', { name: 'Beginner ladder' });
    expect(screen.getByText(/2\/3 solved/)).toBeInTheDocument();
  });

  it('renders the empty state when no tracks exist', async () => {
    api.list.mockResolvedValue({ count: 0, results: [] });
    render(<TracksPage />);

    expect(await screen.findByText('No tracks yet')).toBeInTheDocument();
  });

  it('surfaces a load error', async () => {
    api.list.mockRejectedValue(new Error('boom'));
    render(<TracksPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });

  it('lets creators add a track and refreshes the list', async () => {
    mocks.auth.user = {
      id: 8,
      username: 'dana',
      email: 'd@x.com',
      role: 'CREATOR',
    } as User;
    api.list.mockResolvedValue({ count: 0, results: [] });
    api.create.mockResolvedValue({ ...ROW, slug: 'new-track' });
    render(<TracksPage />);

    const title = await screen.findByLabelText(/Track title \(English\)/i);
    fireEvent.change(title, { target: { value: 'Graph starter' } });
    fireEvent.click(screen.getByRole('button', { name: /create track/i }));

    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ title_en: 'Graph starter' }));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });

  it('shows a create failure message', async () => {
    mocks.auth.user = {
      id: 8,
      username: 'dana',
      email: 'd@x.com',
      role: 'TEACHER',
    } as User;
    api.list.mockResolvedValue({ count: 0, results: [] });
    api.create.mockRejectedValue(new Error('nope'));
    render(<TracksPage />);

    fireEvent.change(await screen.findByLabelText(/Track title \(English\)/i), {
      target: { value: 'X' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create track/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('nope');
  });
});
