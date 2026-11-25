'use client';

// Problem-page wave (item C) — the per-user incremental test-unlock board.
//
// A submission that passes k of n tests unlocks test k+1 ONLY: that test's
// input + expected output become visible to this user for debugging.
// Positions 1..k render SOLVED, k+1 UNLOCKED (data shown), the rest
// LOCKED — never beyond the earned index.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { SolverService, type TestsStatusResponse } from '@/services/ApiService';
import { palette, hexAlpha } from '@/theme/tokens';

const STATUS_COLORS: Record<string, string> = {
  solved: palette.success,
  unlocked: palette.accent,
  locked: palette.muted,
};

export default function TestUnlockBoard({ problemId }: { problemId: string }): ReactNode {
  const { t } = useTranslation();
  const [data, setData] = useState<TestsStatusResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    SolverService.getTestsStatus(problemId)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [problemId]);

  if (error || !data || data.unlock_state.total === 0) return null;
  const { unlock_state: state } = data;

  return (
    <div
      data-testid="test-unlock-board"
      style={{
        border: `1px solid ${hexAlpha(palette.accent, 0.25)}`,
        borderRadius: 'var(--radius-md)',
        padding: '14px 16px',
        display: 'grid',
        gap: '10px',
        background: hexAlpha(palette.accent, 0.04),
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ fontSize: '0.9rem' }}>
          {t('unlock_board_title', 'Test unlocking')}
        </strong>
        <span data-testid="unlock-board-progress" style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
          {t('unlock_board_progress', {
            defaultValue: '{{passed}} / {{total}} tests passed — test {{next}} unlocked for debugging',
            passed: state.passed_count,
            total: state.total,
            next: Math.min(state.passed_count + 1, state.total),
          })}
        </span>
      </div>
      <div style={{ display: 'grid', gap: '6px' }}>
        {data.tests.map((row) => (
          <div
            key={row.id}
            data-testid={`unlock-row-${row.position}`}
            style={{
              display: 'grid',
              gap: '6px',
              padding: '8px 10px',
              borderRadius: '8px',
              border: `1px solid ${hexAlpha(STATUS_COLORS[row.status] ?? palette.muted, 0.35)}`,
              background: hexAlpha(STATUS_COLORS[row.status] ?? palette.muted, 0.05),
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                fontSize: '0.8rem',
                flexWrap: 'wrap',
              }}
            >
              {row.status === 'solved' ? (
                <CheckCircleOutlinedIcon sx={{ fontSize: 16, color: STATUS_COLORS.solved }} />
              ) : row.status === 'unlocked' ? (
                <VisibilityOutlinedIcon sx={{ fontSize: 16, color: STATUS_COLORS.unlocked }} />
              ) : (
                <LockOutlinedIcon sx={{ fontSize: 16, color: STATUS_COLORS.locked }} />
              )}
              <strong>
                {t('test_case_label', 'Test Case')} {row.position}
              </strong>
              <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                {row.points} {t('points_label', 'Points')}
              </span>
              <span
                data-testid={`unlock-status-${row.position}`}
                style={{ fontSize: '0.72rem', fontWeight: 700, color: STATUS_COLORS[row.status] }}
              >
                {row.status === 'solved'
                  ? t('unlock_status_solved', 'Solved')
                  : row.status === 'unlocked'
                    ? t('unlock_status_unlocked', 'Unlocked')
                    : t('unlock_status_locked', 'Locked')}
              </span>
              {row.is_sample && (
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                  {t('sample_label', 'Sample')}
                </span>
              )}
            </div>
            {row.status === 'unlocked' && row.input_data !== null && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '8px' }}>
                <div>
                  <div className="micro-label" style={{ color: 'var(--muted)' }}>
                    {t('test_case_input_label', 'Input')}
                  </div>
                  <pre
                    data-testid={`unlock-input-${row.position}`}
                    style={{
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '6px 8px',
                    }}
                  >
                    {row.input_data}
                  </pre>
                </div>
                <div>
                  <div className="micro-label" style={{ color: 'var(--muted)' }}>
                    {t('test_case_output_label', 'Expected output')}
                  </div>
                  <pre
                    data-testid={`unlock-expected-${row.position}`}
                    style={{
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '6px 8px',
                    }}
                  >
                    {row.expected_output_data}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {!state.solved_all && (
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted)' }}>
          {t('unlock_board_hint', {
            defaultValue:
              'Pass {{next}} tests in one submission to unlock test {{after}}.',
            next: state.passed_count + 1,
            after: state.passed_count + 2,
          })}
        </p>
      )}
    </div>
  );
}
