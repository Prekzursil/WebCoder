'use client';

// [wave E items 16/17] The verification surface for a queued problem:
// - hidden-test preview (item 17): every test with its input/expected
//   pair, sample flag, points, subtask group and per-test bar — verifiers
//   review tests WITHOUT opening the author's edit page;
// - testcase strength (item 16): each test's catch rate over the
//   problem's known-wrong submissions + the suite strength reading.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TestCaseService, VerificationService } from '@/services/ApiService';
import type { TestCaseType } from '@/types';
import type { TestStrengthRow } from '@/services/ApiService';
import { palette, hexAlpha } from '@/theme/tokens';

const TRUNCATE = 160;

function Cell({ text }: { text: string }): ReactNode {
  const [open, setOpen] = useState(false);
  const long = text.length > TRUNCATE;
  return (
    <pre
      onClick={() => long && setOpen((v) => !v)}
      style={{
        margin: 0,
        maxWidth: '260px',
        maxHeight: open ? '260px' : '72px',
        overflow: open ? 'auto' : 'hidden',
        cursor: long ? 'pointer' : 'default',
        background: 'var(--surface-2)',
        padding: '6px',
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.72rem',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: 'var(--foreground)',
      }}
    >
      {text || '\u00a0'}
    </pre>
  );
}

export default function TestsPreviewPanel({ problemId }: { problemId: number }): ReactNode {
  const { t } = useTranslation();
  const [tests, setTests] = useState<TestCaseType[] | null>(null);
  const [strength, setStrength] = useState<{
    calibrated: boolean;
    wrong_solutions: number;
    suite_strength: number | null;
    tests: TestStrengthRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      TestCaseService.listTestCases(problemId).then((r) => r.results),
      VerificationService.getTestStrength(problemId),
    ])
      .then(([rows, s]) => {
        if (cancelled) return;
        setTests(rows);
        setStrength(s);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [problemId]);

  if (error) {
    return <p style={{ color: palette.danger, fontSize: '0.8rem', margin: '6px 12px' }}>{error}</p>;
  }
  if (tests === null || strength === null) {
    return (
      <p style={{ color: 'var(--muted)', fontSize: '0.8rem', margin: '6px 12px' }}>
        {t('verify_loading_tests', 'Loading tests…')}
      </p>
    );
  }

  const strengthByTest = new Map(strength.tests.map((row) => [row.test_id, row]));

  return (
    <div style={{ padding: '8px 12px 14px' }} data-testid={`tests-preview-${problemId}`}>
      <div
        style={{
          display: 'flex',
          gap: '16px',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          marginBottom: '8px',
          fontSize: '0.8rem',
        }}
      >
        <span className="micro-label">
          {t('verify_tests_title', 'Tests ({{n}})', { n: tests.length })}
        </span>
        {strength.calibrated ? (
          <span data-testid={`suite-strength-${problemId}`}>
            {t('verify_suite_strength', 'Suite strength')}:{' '}
            <strong>{Math.round((strength.suite_strength ?? 0) * 100)}%</strong>{' '}
            <span style={{ color: 'var(--text-tertiary)' }}>
              ({t('verify_wrong_basis', '{{n}} wrong solutions', { n: strength.wrong_solutions })})
            </span>
          </span>
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>
            {t('verify_uncalibrated', 'No wrong solutions yet — strength uncalibrated.')}
          </span>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr>
              {[
                '#',
                t('verify_col_kind', 'Kind'),
                t('verify_col_points', 'Points'),
                t('verify_col_subtask', 'Subtask'),
                t('verify_col_bar', 'Bar (ms)'),
                t('verify_col_catch', 'Catch rate'),
                t('verify_col_input', 'Input'),
                t('verify_col_expected', 'Expected'),
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: 'left',
                    padding: '4px 8px',
                    borderBottom: '1px solid var(--border-strong)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tests.map((tc) => {
              const row = tc.id !== undefined ? strengthByTest.get(tc.id) : undefined;
              const rate = row?.catch_rate ?? null;
              const rateColor =
                rate === null
                  ? palette.muted
                  : rate >= 0.8
                    ? palette.success
                    : rate >= 0.4
                      ? palette.warn
                      : palette.danger;
              return (
                <tr key={tc.id} data-testid={`preview-test-${tc.id}`}>
                  <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)' }}>{tc.order}</td>
                  <td style={{ padding: '4px 8px' }}>
                    {tc.is_sample ? (
                      <span style={{ color: 'var(--violet)', fontWeight: 600 }}>
                        {t('sample_label', 'Sample')}
                      </span>
                    ) : (
                      <span
                        style={{
                          color: palette.muted,
                          background: hexAlpha(palette.muted, 0.12),
                          padding: '1px 8px',
                          borderRadius: '999px',
                          fontSize: '0.7rem',
                        }}
                      >
                        {t('verify_hidden_label', 'hidden')}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '4px 8px' }}>{tc.points}</td>
                  <td style={{ padding: '4px 8px' }}>{tc.subtask || '—'}</td>
                  <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)' }}>
                    {tc.time_limit_ms ?? '—'}
                  </td>
                  <td
                    style={{
                      padding: '4px 8px',
                      fontFamily: 'var(--font-mono)',
                      color: rateColor,
                      fontWeight: rate !== null && rate >= 0.8 ? 700 : 400,
                    }}
                  >
                    {rate === null ? '—' : `${Math.round(rate * 100)}%`}
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <Cell text={tc.input_data} />
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <Cell text={tc.expected_output_data} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
