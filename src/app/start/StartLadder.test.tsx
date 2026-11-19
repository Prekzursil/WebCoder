import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import StartLadder from './StartLadder';
import * as ApiService from '@/services/ApiService';

// [wave E item 31] The /start ladder: seeded first-solve-ladder track with
// per-viewer solved marks and rung numbering.

vi.mock('@/services/ApiService', () => ({
  // [wave G item 82/88] the palette/onboarding surfaces need these.
  SearchService: { federated: vi.fn().mockResolvedValue({ query: '', results: {} }) },
  OnboardingService: { get: vi.fn().mockResolvedValue({ steps: [], done: 0, total: 0 }) },
  TrackService: { get: vi.fn() },
}));
vi.mock('@/context/AuthContext', async () => {
  const { createContext } = await import('react');
  return {
    AuthContext: createContext({
      isAuthenticated: true,
      user: { id: 1, username: 'u', role: 'BASIC' },
    }),
  };
});

const { TrackService } = ApiService as unknown as {
  TrackService: { get: ReturnType<typeof vi.fn> };
};

beforeEach(() => TrackService.get.mockReset());
afterEach(cleanup);

describe('StartLadder', () => {
  it('renders the ordered rungs with solved marks and progress', async () => {
    TrackService.get.mockResolvedValue({
      slug: 'first-solve-ladder',
      title_i18n: { en: 'Guided first-solve ladder', ro: 'Scara ghidată' },
      description_i18n: {
        en: 'Six rungs from reading input to binary search.',
        ro: 'Șase trepte.',
      },
      items: [
        {
          problem_id: 1,
          title_i18n: { en: 'Hello, Judge!' },
          difficulty: 'VERY_EASY',
          position: 1,
          is_solved: true,
        },
        {
          problem_id: 2,
          title_i18n: { en: 'Sum of Two Numbers' },
          difficulty: 'VERY_EASY',
          position: 2,
          is_solved: false,
        },
      ],
    });
    render(<StartLadder />);
    await waitFor(() => {
      expect(screen.getByTestId('start-ladder')).toBeTruthy();
    });
    expect(screen.getByText('Hello, Judge!')).toBeTruthy();
    expect(screen.getByText('Sum of Two Numbers')).toBeTruthy();
    expect(screen.getByText(/1\/2 solved/i)).toBeTruthy();
    const links = screen.getAllByRole('link');
    expect(links.some((l) => l.getAttribute('href') === '/problems/2')).toBe(true);
  });

  it('renders nothing when the track is missing or empty', async () => {
    TrackService.get.mockResolvedValue({
      slug: 'first-solve-ladder',
      title_i18n: { en: 'ladder' },
      items: [],
    });
    const { container } = render(<StartLadder />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
