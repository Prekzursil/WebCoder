import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import TestsPreviewPanel from './TestsPreviewPanel';
import * as ApiService from '@/services/ApiService';

// [wave E items 16/17] The verification surface: hidden-test preview with
// input/expected pairs + per-test catch rates and the suite-strength
// reading.

vi.mock('@/services/ApiService', () => ({
  // [wave G item 82/88] the palette/onboarding surfaces need these.
  SearchService: { federated: vi.fn().mockResolvedValue({ query: '', results: {} }) },
  OnboardingService: { get: vi.fn().mockResolvedValue({ steps: [], done: 0, total: 0 }) },
  TestCaseService: { listTestCases: vi.fn() },
  VerificationService: { getTestStrength: vi.fn() },
}));

const { TestCaseService, VerificationService } = ApiService as unknown as {
  TestCaseService: { listTestCases: ReturnType<typeof vi.fn> };
  VerificationService: { getTestStrength: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  TestCaseService.listTestCases.mockReset();
  VerificationService.getTestStrength.mockReset();
});

afterEach(cleanup);

const STRENGTH = {
  problem_id: 7,
  calibrated: true,
  wrong_solutions: 4,
  suite_strength: 0.75,
  tests: [
    {
      test_id: 11,
      order: 1,
      is_sample: true,
      subtask: '',
      points: 10,
      time_limit_ms: null,
      wrong_solutions: 4,
      caught: 1,
      catch_rate: 0.25,
    },
    {
      test_id: 12,
      order: 2,
      is_sample: false,
      subtask: 'A',
      points: 30,
      time_limit_ms: 4000,
      wrong_solutions: 4,
      caught: 4,
      catch_rate: 1,
    },
  ],
};

describe('TestsPreviewPanel', () => {
  it('renders tests with catch rates and suite strength', async () => {
    TestCaseService.listTestCases.mockResolvedValue({
      results: [
        {
          id: 11,
          input_data: '1',
          expected_output_data: '1',
          is_sample: true,
          points: 10,
          order: 1,
          subtask: '',
          time_limit_ms: null,
        },
        {
          id: 12,
          input_data: '999999',
          expected_output_data: '42',
          is_sample: false,
          points: 30,
          order: 2,
          subtask: 'A',
          time_limit_ms: 4000,
        },
      ],
    });
    VerificationService.getTestStrength.mockResolvedValue(STRENGTH);
    render(<TestsPreviewPanel problemId={7} />);
    await waitFor(() => {
      expect(screen.getByTestId('tests-preview-7')).toBeTruthy();
    });
    expect(screen.getByTestId('suite-strength-7').textContent).toContain('75%');
    expect(screen.getByTestId('preview-test-12').textContent).toContain('100%');
    // The hidden flag + per-test bar are visible to the verifier.
    expect(screen.getByTestId('preview-test-12').textContent).toContain('hidden');
    expect(screen.getByTestId('preview-test-12').textContent).toContain('4000');
  });

  it('shows the uncalibrated note without wrong solutions', async () => {
    TestCaseService.listTestCases.mockResolvedValue({ results: [] });
    VerificationService.getTestStrength.mockResolvedValue({
      problem_id: 8,
      calibrated: false,
      wrong_solutions: 0,
      suite_strength: null,
      tests: [],
    });
    render(<TestsPreviewPanel problemId={8} />);
    await waitFor(() => {
      expect(screen.getByText(/strength uncalibrated/i)).toBeTruthy();
    });
  });

  it('surfaces load errors without crashing', async () => {
    TestCaseService.listTestCases.mockRejectedValue(new Error('nope'));
    VerificationService.getTestStrength.mockResolvedValue(STRENGTH);
    render(<TestsPreviewPanel problemId={9} />);
    await waitFor(() => {
      expect(screen.getByText('nope')).toBeTruthy();
    });
  });
});
