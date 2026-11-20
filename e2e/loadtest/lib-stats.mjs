// Item 138 (wave G section J) — load-test summary math, importable so it
// is unit-tested (e2e/loadtest/lib-stats.test.ts) while replay.mjs stays
// a thin runner.

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Summarize per-request wait times (ms) into the OPR-4 exit-gate view. */
export function summarize(durationsMs) {
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = count ? sorted.reduce((acc, value) => acc + value, 0) : 0;
  return {
    count,
    avg_ms: count ? Math.round(sum / count) : null,
    p50_ms: percentile(sorted, 50),
    p95_ms: percentile(sorted, 95),
    max_ms: count ? sorted[count - 1] : null,
    // The rated-contest exit gate: p95 judge wait under 20 s (OPR-4).
    gate_p95_under_20s: count ? percentile(sorted, 95) < 20000 : false,
  };
}

/** Throughput over the measured wall-clock span. */
export function throughput(count, elapsedMs) {
  if (elapsedMs <= 0) return null;
  return Math.round((count / elapsedMs) * 1000 * 100) / 100; // req/s, 2dp
}
