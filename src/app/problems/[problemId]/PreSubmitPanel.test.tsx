import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import PreSubmitPanel from './PreSubmitPanel';
import * as ApiService from '@/services/ApiService';

// [wave E items 8/9] The pre-submit panel: lint warnings render bilingually
// (locale-picked), sample results render per-test verdicts, and API errors
// surface without crashing the submit form.

vi.mock('@/services/ApiService', () => ({
  // [wave G item 82/88] the palette/onboarding surfaces need these.
  SearchService: { federated: vi.fn().mockResolvedValue({ query: '', results: {} }) },
  OnboardingService: { get: vi.fn().mockResolvedValue({ steps: [], done: 0, total: 0 }) },
  PreSubmitService: {
    lint: vi.fn(),
    runSamples: vi.fn(),
  },
}));

const { PreSubmitService } = ApiService as unknown as {
  PreSubmitService: { lint: ReturnType<typeof vi.fn>; runSamples: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  PreSubmitService.lint.mockReset();
  PreSubmitService.runSamples.mockReset();
});

afterEach(cleanup);

describe('PreSubmitPanel', () => {
  it('renders lint warnings with the line chip', async () => {
    PreSubmitService.lint.mockResolvedValue({
      count: 1,
      warnings: [
        {
          rule: 'py_bare_except',
          line: 3,
          severity: 'warning',
          message_en: 'A bare except also catches Ctrl+C.',
          message_ro: 'Un except gol prinde și Ctrl+C.',
        },
      ],
    });
    render(<PreSubmitPanel problemId="7" language="python3" code="try:\n pass\nexcept:\n" />);
    await fireEvent.click(screen.getByTestId('presubmit-lint-button'));
    await waitFor(() => {
      expect(screen.getByTestId('presubmit-warnings')).toBeTruthy();
    });
    expect(screen.getByText(/bare except/i)).toBeTruthy();
    expect(screen.getByText('L3')).toBeTruthy();
  });

  it('shows the all-clear message when the lint is clean', async () => {
    PreSubmitService.lint.mockResolvedValue({ count: 0, warnings: [] });
    render(<PreSubmitPanel problemId="7" language="python3" code="print(1)" />);
    await fireEvent.click(screen.getByTestId('presubmit-lint-button'));
    await waitFor(() => {
      expect(screen.getByText(/No warnings/i)).toBeTruthy();
    });
  });

  it('renders per-sample verdicts from the dress rehearsal', async () => {
    PreSubmitService.runSamples.mockResolvedValue({
      compile_error: null,
      samples: [
        {
          test_id: 1,
          order: 1,
          verdict: 'AC',
          time_ms: 12,
          output: '42',
          expected: '42',
          mismatch_hint: null,
        },
        {
          test_id: 2,
          order: 2,
          verdict: 'WA',
          time_ms: 9,
          output: '41',
          expected: '42',
          mismatch_hint: 'differs at line 1',
        },
      ],
    });
    render(<PreSubmitPanel problemId="7" language="python3" code="print(41)" />);
    await fireEvent.click(screen.getByTestId('presubmit-samples-button'));
    await waitFor(() => {
      expect(screen.getByTestId('presubmit-sample-2')).toBeTruthy();
    });
    expect(screen.getByTestId('presubmit-sample-1').textContent).toContain('AC');
    expect(screen.getByTestId('presubmit-sample-2').textContent).toContain('WA');
    expect(screen.getByTestId('presubmit-sample-2').textContent).toContain('differs at line 1');
  });

  it('surfaces the compile error verbatim', async () => {
    PreSubmitService.runSamples.mockResolvedValue({
      compile_error: "error: expected ';' before '}'",
      samples: [],
    });
    render(<PreSubmitPanel problemId="7" language="cpp17" code="int main(){}" />);
    await fireEvent.click(screen.getByTestId('presubmit-samples-button'));
    await waitFor(() => {
      expect(screen.getByTestId('presubmit-compile-error').textContent).toContain("expected ';'");
    });
  });

  it('surfaces API failures without crashing', async () => {
    PreSubmitService.lint.mockRejectedValue(new Error('boom'));
    render(<PreSubmitPanel problemId="7" language="python3" code="x" />);
    await fireEvent.click(screen.getByTestId('presubmit-lint-button'));
    await waitFor(() => {
      expect(screen.getByText('boom')).toBeTruthy();
    });
  });

  it('disables actions without code', () => {
    render(<PreSubmitPanel problemId="7" language="python3" code="" />);
    expect((screen.getByTestId('presubmit-lint-button') as HTMLButtonElement).disabled).toBe(true);
  });
});
