// Item 138 — unit tests for the load-test summary math (the OPR-4 exit
// gate decision must itself be tested).

import { describe, expect, it } from 'vitest';
import { percentile, summarize, throughput } from './lib-stats.mjs';

describe('loadtest stats [item 138]', () => {
  it('percentile interpolates and guards degenerate inputs', () => {
    expect(percentile([], 95)).toBeNull();
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    // p95 of 1..20: idx 18.05 → 19 + 0.05 × (20 − 19) = 19.05.
    expect(
      percentile(
        Array.from({ length: 20 }, (_, i) => i + 1),
        95,
      ),
    ).toBeCloseTo(19.05, 5);
  });

  it('summarize reports the OPR-4 gate', () => {
    const fast = summarize([100, 200, 300, 400, 500]);
    expect(fast.p50_ms).toBe(300);
    expect(fast.gate_p95_under_20s).toBe(true);

    const slow = summarize([25000, 26000, 27000]);
    expect(slow.gate_p95_under_20s).toBe(false);

    const empty = summarize([]);
    expect(empty.count).toBe(0);
    expect(empty.avg_ms).toBeNull();
    expect(empty.gate_p95_under_20s).toBe(false);
  });

  it('throughput is per-second and guards zero span', () => {
    expect(throughput(10, 1000)).toBe(10);
    expect(throughput(10, 0)).toBeNull();
  });
});
