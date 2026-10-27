import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import CreateContestPage from './page';
import type { User } from '@/types';

// CON-9: community-contest creation gate (teacher/creator only) and the
// happy path assembling the PRIVATE unrated mashup payload.

const api = vi.hoisted(() => ({ createContest: vi.fn() }));

vi.mock('@/services/ApiService', () => ({
  ContestService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 7, username: 'bob', email: 'b@x.com', role: 'TEACHER' } as User | null,
    login: vi.fn(),
    logout: vi.fn(),
  },
  push: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('CreateContestPage', () => {
  it('blocks roles that may not create community contests', () => {
    mocks.auth.user = {
      id: 7,
      username: 'bob',
      email: 'b@x.com',
      role: 'BASIC_USER',
    } as User;
    render(<CreateContestPage />);

    expect(
      screen.getByText(/created by teachers and verified creators/i)
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Title \(English\)/i)).not.toBeInTheDocument();
  });

  it('submits a PRIVATE unrated mashup with the ordered problem ids', async () => {
    mocks.auth.user = {
      id: 8,
      username: 'dana',
      email: 'd@x.com',
      role: 'CREATOR',
    } as User;
    api.createContest.mockResolvedValue({ id: 42 });

    render(<CreateContestPage />);
    fireEvent.change(screen.getByLabelText(/Title \(English\)/i), {
      target: { value: 'Weekend Mashup' },
    });
    fireEvent.change(screen.getByLabelText(/Starts at/i), {
      target: { value: '2026-11-05T18:00' },
    });
    fireEvent.change(screen.getByLabelText(/Ends at/i), {
      target: { value: '2026-11-05T20:00' },
    });
    fireEvent.change(screen.getByLabelText(/Access code/i), {
      target: { value: 'join42' },
    });
    fireEvent.change(screen.getByLabelText(/Problem IDs/i), {
      target: { value: '12, 15, 30' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create contest/i }));

    await waitFor(() => expect(api.createContest).toHaveBeenCalledTimes(1));
    const payload = api.createContest.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.visibility).toBe('PRIVATE');
    expect(payload.is_rated).toBe(false);
    expect(payload.problem_ids).toEqual([12, 15, 30]);
    expect(payload.title_i18n).toEqual({ en: 'Weekend Mashup', ro: 'Weekend Mashup' });
    expect(mocks.push).toHaveBeenCalledWith('/contests/42');
  });

  it('surfaces the backend rejection when the pool check fails', async () => {
    mocks.auth.user = {
      id: 8,
      username: 'dana',
      email: 'd@x.com',
      role: 'CREATOR',
    } as User;
    api.createContest.mockRejectedValue(new Error('Problems must exist and be APPROVED'));

    render(<CreateContestPage />);
    fireEvent.change(screen.getByLabelText(/Title \(English\)/i), {
      target: { value: 'Bad Mashup' },
    });
    fireEvent.change(screen.getByLabelText(/Starts at/i), {
      target: { value: '2026-11-05T18:00' },
    });
    fireEvent.change(screen.getByLabelText(/Ends at/i), {
      target: { value: '2026-11-05T20:00' },
    });
    fireEvent.change(screen.getByLabelText(/Access code/i), {
      target: { value: 'join42' },
    });
    fireEvent.change(screen.getByLabelText(/Problem IDs/i), {
      target: { value: '999' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create contest/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('APPROVED');
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
