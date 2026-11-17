'use client';

// [wave E item 13] A generic line-by-line diff with configurable labels:
// lines are compared pairwise; the first divergence is highlighted. Used
// by the submission detail's "diff vs previous attempt" view. (The WA
// diff viewer on test outputs keeps its own component — labels and data
// sources differ; this one is source-code oriented, monospace, scrolly.)

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { palette, hexAlpha } from '@/theme/tokens';

export default function LineDiff({
  left,
  right,
  leftLabel,
  rightLabel,
}: {
  left: string;
  right: string;
  leftLabel?: string;
  rightLabel?: string;
}): ReactNode {
  const { t } = useTranslation();
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const n = Math.max(leftLines.length, rightLines.length);
  let firstMismatch = -1;
  const rows: { line: number; l: string; r: string; changed: boolean }[] = [];
  for (let i = 0; i < n; i += 1) {
    const l = leftLines[i] ?? '';
    const r = rightLines[i] ?? '';
    const changed = l !== r;
    if (changed && firstMismatch === -1) firstMismatch = i;
    rows.push({ line: i + 1, l, r, changed });
  }
  return (
    <div data-testid="line-diff">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.68rem',
          color: 'var(--text-tertiary)',
          marginBottom: '4px',
          gap: '8px',
        }}
      >
        <span>{leftLabel ?? t('diff_previous', 'Previous')}</span>
        <span>{rightLabel ?? t('diff_current', 'Current')}</span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '40px 1fr 1fr',
          gap: '0 8px',
          background: 'var(--surface-2)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.78rem',
          maxHeight: '320px',
          overflow: 'auto',
        }}
      >
        {rows.map((row) => {
          const first = row.line - 1 === firstMismatch;
          return (
            <div key={row.line} style={{ display: 'contents' }}>
              <div
                data-testid={`linediff-row-${row.line}`}
                style={{
                  color: row.changed ? palette.danger : 'var(--text-tertiary)',
                  fontWeight: first ? 700 : 400,
                }}
              >
                {row.line}
              </div>
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  background: first ? hexAlpha(palette.danger, 0.12) : undefined,
                  borderRadius: first ? '4px' : undefined,
                  padding: first ? '0 4px' : undefined,
                  color: row.changed ? palette.danger : 'var(--foreground)',
                }}
              >
                {row.l || '\u00a0'}
              </div>
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  background: first ? hexAlpha(palette.danger, 0.12) : undefined,
                  borderRadius: first ? '4px' : undefined,
                  padding: first ? '0 4px' : undefined,
                  color: row.changed ? palette.danger : 'var(--foreground)',
                }}
              >
                {row.r || '\u00a0'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
