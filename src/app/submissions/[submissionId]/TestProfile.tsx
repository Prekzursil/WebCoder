'use client';

// [wave E items 6/7/19/21/25] Judge-feedback depth for the submission
// detail page:
// - LimitBar — "used vs the bar the judge applied" for time and memory on
//   every test (items 6/19/25: per-test time bars, memory profiling, TLE
//   time-travel — the ratio makes near-limit runs visible before they tip).
// - ClosenessBadge — the "Am I close?" band derived from score/full_score
//   (item 21): a near-miss WA reads as "so close" instead of a bare verdict.
// - SampleDiff — the WA diff viewer (item 7): expected vs actual, line by
//   line, first mismatch highlighted; rendered for tests whose expected
//   output is exposed (samples by design, hidden tests for staff/author).

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClosenessType, SubmissionTestResultType } from '@/types';
import { palette, hexAlpha } from '@/theme/tokens';

export function LimitBar({
  used,
  limit,
  label,
  unit,
}: {
  used: number | null | undefined;
  limit: number | null | undefined;
  label: string;
  unit: string;
}): ReactNode {
  const { t } = useTranslation();
  if (
    used === null ||
    used === undefined ||
    used < 0 ||
    limit === null ||
    limit === undefined ||
    limit <= 0
  ) {
    return null;
  }
  const ratio = Math.min(1, used / limit);
  const over = used > limit;
  const color = over ? palette.danger : ratio >= 0.8 ? palette.warn : palette.success;
  return (
    <div style={{ minWidth: '180px', flex: '1 1 180px' }} data-testid="limit-bar">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.7rem',
          color: 'var(--text-tertiary)',
          marginBottom: '2px',
        }}
      >
        <span>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>
          {used} / {limit} {unit}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        style={{
          height: '6px',
          borderRadius: '999px',
          background: 'var(--surface-2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.max(2, Math.round(ratio * 100))}%`,
            height: '100%',
            background: color,
            transition: 'width 0.2s ease',
          }}
        />
      </div>
      {ratio >= 0.8 && !over && (
        <div style={{ fontSize: '0.68rem', color: palette.warn, marginTop: '2px' }}>
          {t('profile_near_limit', 'near the limit')}
        </div>
      )}
      {over && (
        <div style={{ fontSize: '0.68rem', color: palette.danger, marginTop: '2px' }}>
          {t('profile_over_limit', 'over the limit')}
        </div>
      )}
    </div>
  );
}

const BAND_COLORS: Record<ClosenessType['band'], string> = {
  SOLVED: palette.success,
  SO_CLOSE: palette.warn,
  HALFWAY: palette.accent,
  STARTED: palette.muted,
  NONE: palette.muted,
};

const BAND_KEYS: Record<ClosenessType['band'], string> = {
  SOLVED: 'closeness_solved',
  SO_CLOSE: 'closeness_so_close',
  HALFWAY: 'closeness_halfway',
  STARTED: 'closeness_started',
  NONE: 'closeness_none',
};

export function ClosenessBadge({ closeness }: { closeness: ClosenessType | null | undefined }): ReactNode {
  const { t } = useTranslation();
  if (!closeness) return null;
  const color = BAND_COLORS[closeness.band];
  return (
    <span
      data-testid="closeness-badge"
      title={t('closeness_title', 'How close this submission was to full score')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 12px',
        borderRadius: '999px',
        fontSize: '0.78rem',
        fontWeight: 700,
        color,
        background: hexAlpha(color, 0.1),
        border: `1px solid ${hexAlpha(color, 0.25)}`,
      }}
    >
      {t(BAND_KEYS[closeness.band], closeness.band)}
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
        {Math.round(closeness.ratio * 100)}%
      </span>
    </span>
  );
}

function diffRows(expected: string, actual: string): { line: number; exp: string; act: string; first: boolean }[] {
  const expLines = expected.split('\n');
  const actLines = actual.split('\n');
  const rows: { line: number; exp: string; act: string; first: boolean }[] = [];
  let firstFound = false;
  for (let i = 0; i < Math.max(expLines.length, actLines.length); i += 1) {
    const exp = expLines[i] ?? '';
    const act = actLines[i] ?? '';
    const mismatch = exp !== act;
    const first = mismatch && !firstFound;
    if (first) firstFound = true;
    rows.push({ line: i + 1, exp, act, first });
  }
  return rows;
}

export function SampleDiff({ expected, actual }: { expected: string; actual: string }): ReactNode {
  const { t } = useTranslation();
  const rows = diffRows(expected, actual);
  const firstIdx = rows.findIndex((r) => r.first);
  return (
    <div data-testid="sample-diff" style={{ marginTop: '0.75rem' }}>
      <div
        style={{
          fontSize: '0.65rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--text-tertiary)',
          marginBottom: '4px',
        }}
      >
        {t('diff_viewer_title', 'Output diff — expected vs yours')}
        {firstIdx >= 0 && (
          <span style={{ color: palette.danger, textTransform: 'none', marginLeft: '8px' }}>
            {t('diff_first_mismatch', 'first mismatch at line {{n}}', { n: firstIdx + 1 })}
          </span>
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '44px 1fr 1fr',
          gap: '0 8px',
          background: 'var(--surface-2)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.78rem',
          maxHeight: '220px',
          overflowY: 'auto',
        }}
      >
        <div style={{ color: 'var(--text-tertiary)' }}>#</div>
        <div style={{ color: 'var(--text-tertiary)' }}>{t('diff_expected', 'Expected')}</div>
        <div style={{ color: 'var(--text-tertiary)' }}>{t('diff_yours', 'Yours')}</div>
        {rows.map((r) => (
          <div
            key={r.line}
            style={{
              display: 'contents',
            }}
          >
            <div
              data-testid={`diff-line-${r.line}`}
              style={{
                color: r.first ? palette.danger : 'var(--text-tertiary)',
                fontWeight: r.first ? 700 : 400,
              }}
            >
              {r.line}
            </div>
            <div
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: r.first ? hexAlpha(palette.danger, 0.12) : undefined,
                borderRadius: r.first ? '4px' : undefined,
                padding: r.first ? '0 4px' : undefined,
                color: 'var(--foreground)',
              }}
            >
              {r.exp || '\u00a0'}
            </div>
            <div
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: r.first ? hexAlpha(palette.danger, 0.12) : undefined,
                borderRadius: r.first ? '4px' : undefined,
                padding: r.first ? '0 4px' : undefined,
                color: 'var(--foreground)',
              }}
            >
              {r.act || '\u00a0'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TestProfile({ result }: { result: SubmissionTestResultType }): ReactNode {
  const { t } = useTranslation();
  const hasTimeBar =
    result.limit_time_ms !== null &&
    result.limit_time_ms !== undefined &&
    result.execution_time_ms !== null &&
    result.execution_time_ms !== undefined;
  const hasMemoryBar =
    result.limit_memory_kb !== null &&
    result.limit_memory_kb !== undefined &&
    result.memory_used_kb !== null &&
    result.memory_used_kb !== undefined;
  const showDiff =
    result.test_case_details?.expected_output_data !== undefined &&
    result.actual_output !== null &&
    result.actual_output !== undefined &&
    result.verdict === 'WA';
  if (!hasTimeBar && !hasMemoryBar && !showDiff) return null;
  return (
    <div style={{ marginTop: '0.75rem' }}>
      {(hasTimeBar || hasMemoryBar) && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {hasTimeBar && (
            <LimitBar
              used={result.execution_time_ms}
              limit={result.limit_time_ms}
              label={t('profile_time_bar', 'Time vs bar')}
              unit="ms"
            />
          )}
          {hasMemoryBar && (
            <LimitBar
              used={result.memory_used_kb}
              limit={result.limit_memory_kb}
              label={t('profile_memory_bar', 'Memory vs bar')}
              unit="KB"
            />
          )}
        </div>
      )}
      {showDiff && (
        <SampleDiff
          expected={result.test_case_details.expected_output_data as string}
          actual={result.actual_output as string}
        />
      )}
    </div>
  );
}
