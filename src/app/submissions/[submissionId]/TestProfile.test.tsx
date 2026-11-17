import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import TestProfile, { ClosenessBadge, LimitBar, SampleDiff } from './TestProfile';
import type { ClosenessType, SubmissionTestResultType } from '@/types';

afterEach(cleanup);

// [wave E items 6/7/19/21/25] The judge-feedback depth panels: used-vs-bar
// meters, the WA sample diff, and the "Am I close?" band chip.

const result = (over: Partial<SubmissionTestResultType> = {}): SubmissionTestResultType => ({
  id: 1,
  test_case_details: { id: 10, order: 1, is_sample: true, points: 10 },
  verdict: 'WA',
  execution_time_ms: 100,
  memory_used_kb: 1024,
  limit_time_ms: 200,
  limit_memory_kb: 4096,
  actual_output: null,
  error_output: null,
  ...over,
});

describe('LimitBar', () => {
  it('renders a ratio meter with the used/limit readout', () => {
    render(<LimitBar used={100} limit={200} label="Time vs bar" unit="ms" />);
    expect(screen.getByText('100 / 200 ms')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Time vs bar' })).toBeTruthy();
  });

  it('stays silent without a usable pair', () => {
    const { container } = render(
      <LimitBar used={null} limit={200} label="Time vs bar" unit="ms" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('flags over-the-limit runs', () => {
    render(<LimitBar used={300} limit={200} label="Time vs bar" unit="ms" />);
    expect(screen.getByTestId('limit-bar').textContent).toContain('over the limit');
  });
});

describe('ClosenessBadge', () => {
  it('renders the band chip with the rounded percentage', () => {
    const closeness: ClosenessType = { band: 'SO_CLOSE', ratio: 0.83 };
    render(<ClosenessBadge closeness={closeness} />);
    const badge = screen.getByTestId('closeness-badge');
    expect(badge.textContent).toContain('83%');
    // i18n runs for real (English catalog): the SO_CLOSE band renders its
    // translated label.
    expect(badge.textContent).toContain('So close!');
  });

  it('hides entirely when the submission is unscored', () => {
    const { container } = render(<ClosenessBadge closeness={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('SampleDiff', () => {
  it('highlights the first mismatching line', () => {
    render(<SampleDiff expected={'1\n2\n3'} actual={'1\n9\n3'} />);
    expect(screen.getByText('first mismatch at line 2')).toBeTruthy();
    expect(screen.getByTestId('diff-line-2').textContent).toBe('2');
  });

  it('reports no mismatch banner on identical outputs', () => {
    render(<SampleDiff expected={'a'} actual={'a'} />);
    expect(screen.queryByText(/first mismatch/)).toBeNull();
  });
});

describe('TestProfile (composition)', () => {
  it('shows bars and the diff for a WA sample test with data', () => {
    render(
      <TestProfile
        result={result({
          test_case_details: {
            id: 10,
            order: 1,
            is_sample: true,
            points: 10,
            input_data: '2',
            expected_output_data: '42',
          },
          actual_output: '41',
        })}
      />,
    );
    expect(screen.getAllByTestId('limit-bar').length).toBe(2);
    expect(screen.getByTestId('sample-diff')).toBeTruthy();
  });

  it('renders nothing without limits or a diff pair', () => {
    const { container } = render(
      <TestProfile result={result({ limit_time_ms: null, limit_memory_kb: null })} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
