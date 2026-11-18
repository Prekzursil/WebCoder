import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import TeamsPanel from './TeamsPanel';
import PredictionPanel from './PredictionPanel';
import CalibrationCard from '@/app/ratings/CalibrationCard';

// Wave F items 49/55 — the teams surface, the self-prediction panel and
// the calibration card.

const api = vi.hoisted(() => ({
  getTeams: vi.fn(),
  getTeamStandings: vi.fn(),
  getPrediction: vi.fn(),
  predict: vi.fn(),
  getCalibration: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  ContestService: {
    getTeams: api.getTeams,
    getTeamStandings: api.getTeamStandings,
    getPrediction: api.getPrediction,
    predict: api.predict,
  },
  RatingService: { getCalibration: api.getCalibration },
}));

beforeEach(() => {
  api.getTeams.mockReset();
  api.getTeamStandings.mockReset();
  api.getPrediction.mockReset();
  api.predict.mockReset();
  api.getCalibration.mockReset();
});

afterEach(() => cleanup());

describe('TeamsPanel (item 49)', () => {
  it('lists the roster and the team board', async () => {
    api.getTeams.mockResolvedValue({
      count: 2,
      results: [
        {
          id: 1,
          name: 'Alpha',
          captain: 'alice',
          members: ['alice', 'bob'],
          member_count: 2,
          max_members: 3,
        },
        {
          id: 2,
          name: 'Beta',
          captain: 'carol',
          members: ['carol'],
          member_count: 1,
          max_members: 3,
        },
      ],
    });
    api.getTeamStandings.mockResolvedValue({
      count: 2,
      results: [
        {
          rank: 1,
          team: 'Alpha',
          team_id: 1,
          members: ['alice', 'bob'],
          score: 100,
          solved: 1,
          problems: [],
        },
      ],
      format: 'IOI',
      frozen: false,
      section: 'teams',
      team_size: 3,
    });
    render(<TeamsPanel contestId={7} />);
    expect(await screen.findByTestId('team-row-Alpha')).toBeTruthy();
    expect(screen.getByTestId('team-row-Alpha').textContent).toContain('alice, bob');
    expect(screen.getByTestId('team-standing-Alpha').textContent).toContain('100');
  });

  it('renders the empty state for a fresh contest', async () => {
    api.getTeams.mockResolvedValue({ count: 0, results: [] });
    api.getTeamStandings.mockRejectedValue(new Error('not a team contest'));
    render(<TeamsPanel contestId={7} />);
    await waitFor(() => expect(screen.getByText(/No teams yet/i, { exact: false })).toBeTruthy());
  });
});

describe('PredictionPanel (item 55)', () => {
  it('shows the committed prediction and submits a new one', async () => {
    api.getPrediction.mockResolvedValue({ prediction: null, open: true });
    api.predict.mockResolvedValue({ contest: 7, predicted_rank: 12 });
    render(<PredictionPanel contestId={7} isOpen />);
    await screen.findByTestId('prediction-input');
    fireEvent.change(screen.getByTestId('prediction-input'), { target: { value: '12' } });
    fireEvent.click(screen.getByTestId('prediction-submit'));
    await waitFor(() => expect(api.predict).toHaveBeenCalledWith(7, 12));
    await waitFor(() =>
      expect(screen.getByText(/Prediction saved/i, { exact: false })).toBeTruthy(),
    );
  });

  it('displays an existing prediction', async () => {
    api.getPrediction.mockResolvedValue({ prediction: 3, open: true });
    render(<PredictionPanel contestId={7} isOpen />);
    const current = await screen.findByTestId('prediction-current');
    expect(current.textContent).toContain('#3');
  });

  it('surfaces late-prediction errors', async () => {
    api.getPrediction.mockResolvedValue({ prediction: null, open: true });
    api.predict.mockRejectedValue(new Error('Too late — you already submitted'));
    render(<PredictionPanel contestId={7} isOpen />);
    await screen.findByTestId('prediction-input');
    fireEvent.change(screen.getByTestId('prediction-input'), { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('prediction-submit'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Too late'));
  });
});

describe('CalibrationCard (item 55)', () => {
  it('summarizes MAE, bias and the per-contest rows', async () => {
    api.getCalibration.mockResolvedValue({
      count: 2,
      mean_abs_error: 3.5,
      bias: -3.5,
      results: [
        {
          contest: 1,
          title: 'Autumn Open',
          predicted_rank: 1,
          actual_rank: 5,
          error: -4,
          state: 'FINISHED',
        },
        {
          contest: 2,
          title: 'Winter Cup',
          predicted_rank: 2,
          actual_rank: 3,
          error: -1,
          state: 'FINISHED',
        },
      ],
    });
    render(<CalibrationCard username="alice" />);
    const card = await screen.findByTestId('calibration-card');
    expect(card.textContent).toContain('3.5');
    expect(card.textContent).toContain('optimistic');
    expect(screen.getByTestId('calibration-row-1').textContent).toContain('#1 → #5');
  });

  it('empty state invites the first prediction', async () => {
    api.getCalibration.mockResolvedValue({
      count: 0,
      mean_abs_error: null,
      bias: null,
      results: [],
    });
    render(<CalibrationCard username="alice" />);
    expect(await screen.findByTestId('calibration-empty')).toBeTruthy();
  });

  it('renders nothing on API errors', async () => {
    api.getCalibration.mockRejectedValue(new Error('boom'));
    const { container } = render(<CalibrationCard username="alice" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.textContent).toBe('');
  });
});
