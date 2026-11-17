import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import DrillsPage from './page';
import * as ApiService from '@/services/ApiService';

// [wave E items 36/37/38/40] The drills page: daily warmup + the deck,
// answer flow with explanation reveal.

vi.mock('@/services/ApiService', () => ({
  DrillService: { list: vi.fn(), daily: vi.fn(), answer: vi.fn() },
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: 1, username: 'u', role: 'BASIC' } }),
}));

const { DrillService } = ApiService as unknown as {
  DrillService: {
    list: ReturnType<typeof vi.fn>;
    daily: ReturnType<typeof vi.fn>;
    answer: ReturnType<typeof vi.fn>;
  };
};

const choiceDrill = {
  id: 1,
  kind: 'READ_CODE' as const,
  tag: 'loops',
  code: 's = 0\nfor i in range(4):\n    s += i\nprint(s)',
  question_ro: 'Ce afișează?',
  question_en: 'What does this print?',
  options_ro: ['4', '6', '10', '0'],
  options_en: ['4', '6', '10', '0'],
};

const microDrill = {
  id: 2,
  kind: 'MICRO' as const,
  tag: 'loops',
  code: 'total = 0\nfor x in numbers:\n    ___\nprint(total)',
  question_ro: 'Completează linia.',
  question_en: 'Fill the line.',
  options_ro: null,
  options_en: null,
};

beforeEach(() => {
  DrillService.list.mockReset().mockResolvedValue({ count: 2, results: [choiceDrill, microDrill] });
  DrillService.daily.mockReset().mockResolvedValue({ count: 1, results: [choiceDrill] });
  DrillService.answer.mockReset();
});
afterEach(cleanup);

describe('DrillsPage', () => {
  it('renders the daily warmup and the deck with kind filters', async () => {
    render(<DrillsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('daily-warmup')).toBeTruthy();
    });
    expect(screen.getByText(/Today's warmup/i)).toBeTruthy();
    expect(screen.getAllByTestId('drill-1').length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByRole('button', { name: 'MICRO' }));
    await waitFor(() => {
      expect(DrillService.list).toHaveBeenLastCalledWith('MICRO');
    });
  });

  it('answers a choice drill and reveals the explanation', async () => {
    DrillService.answer.mockResolvedValue({
      correct: true,
      error: null,
      explanation_ro: 'Suma este 6.',
      explanation_en: 'The sum is 6.',
      accepted: null,
    });
    render(<DrillsPage />);
    const first = await screen.findAllByTestId('drill-1');
    fireEvent.click(screen.getAllByRole('button', { name: '6' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /check/i })[0]);
    await waitFor(() => {
      expect(screen.getAllByText(/Correct!/i).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText(/The sum is 6./i).length).toBeGreaterThanOrEqual(1);
  });

  it('answers a micro drill with the typed line', async () => {
    DrillService.answer.mockResolvedValue({
      correct: false,
      error: null,
      explanation_ro: '',
      explanation_en: '',
      accepted: null,
    });
    render(<DrillsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('drill-2')).toBeTruthy();
    });
    const input = screen.getByLabelText(/the missing line/i);
    fireEvent.change(input, { target: { value: 'total += x' } });
    fireEvent.click(screen.getAllByRole('button', { name: /check/i }).at(-1) as HTMLElement);
    await waitFor(() => {
      expect(DrillService.answer).toHaveBeenCalledWith(2, 'total += x');
    });
  });

  it('keeps options hidden when the answer is wrong (no spoiler)', async () => {
    DrillService.answer.mockResolvedValue({
      correct: false,
      error: null,
      explanation_ro: '',
      explanation_en: '',
      accepted: null,
    });
    render(<DrillsPage />);
    const first = await screen.findAllByTestId('drill-1');
    fireEvent.click(screen.getAllByRole('button', { name: '4' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /check/i })[0]);
    await waitFor(() => {
      expect(screen.getAllByText(/Not quite./i).length).toBeGreaterThanOrEqual(1);
    });
  });
});
