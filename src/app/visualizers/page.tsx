'use client';

// [wave E item 32] Algorithm visualizers — step through the classics:
// three sorting algorithms with compare/swap highlighting, and binary
// search with the shrinking [lo, hi] window. The engines are pure
// functions in ./sorting (unit-tested); this page is just the player.

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { palette, hexAlpha } from '@/theme/tokens';
import { binarySearchFrames, sortFrames } from './sorting';
import type { SortAlgorithm } from './sorting';

const ALGORITHMS: SortAlgorithm[] = ['bubble', 'insertion', 'selection'];

function Bar({
  value,
  max,
  state,
}: {
  value: number;
  max: number;
  state: 'idle' | 'compared' | 'swapped' | 'inside' | 'outside' | 'sorted';
}): ReactNode {
  const colors: Record<string, string> = {
    idle: 'var(--surface-2)',
    compared: hexAlpha(palette.warn, 0.55),
    swapped: hexAlpha(palette.danger, 0.6),
    inside: hexAlpha(palette.accent, 0.45),
    outside: 'var(--surface-2)',
    sorted: hexAlpha(palette.success, 0.55),
  };
  return (
    <div
      style={{
        width: `${Math.max(8, (value / max) * 100)}%`,
        minWidth: 18,
        height: 22,
        borderRadius: 4,
        background: colors[state],
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.72rem',
        fontFamily: 'var(--font-mono)',
        color: 'var(--foreground)',
        transition: 'width 0.15s ease, background 0.15s ease',
      }}
    >
      {value}
    </div>
  );
}

export default function VisualizersPage(): ReactNode {
  const { t } = useTranslation();
  const [algo, setAlgo] = useState<SortAlgorithm>('bubble');
  const [raw, setRaw] = useState('5, 2, 9, 1, 7');
  const [target, setTarget] = useState(7);
  const [step, setStep] = useState(0);

  const values = useMemo(
    () =>
      raw
        .split(/[\s,]+/)
        .map((token) => parseInt(token, 10))
        .filter((n) => Number.isFinite(n))
        .slice(0, 12),
    [raw],
  );

  const frames = useMemo(() => sortFrames(values, algo), [values, algo]);
  const search = useMemo(() => binarySearchFrames(values, target), [values, target]);
  const frame = frames[Math.min(step, frames.length - 1)];
  const searchFrame = search[Math.min(step, search.length - 1)];
  const max = Math.max(1, ...values);

  return (
    <div className="page-container" style={{ paddingTop: '2.5rem' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>
        {t('viz_title', 'Algorithm visualizers')}
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>
        {t(
          'viz_intro',
          'Watch the classics run frame by frame — compare/swap highlights for the sorts, the shrinking window for binary search.',
        )}
      </p>

      <section
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.25rem',
        }}
        data-testid="viz-sorter"
      >
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.75rem' }}>
          {t('viz_sorting_title', 'Sorting')}
        </h2>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          {ALGORITHMS.map((name) => (
            <button
              key={name}
              type="button"
              className="chip"
              aria-pressed={algo === name}
              onClick={() => {
                setAlgo(name);
                setStep(0);
              }}
              data-testid={`algo-${name}`}
              style={
                algo === name
                  ? {
                      borderColor: 'var(--accent)',
                      color: 'var(--accent)',
                      background: hexAlpha(palette.accent, 0.12),
                    }
                  : undefined
              }
            >
              {name}
            </button>
          ))}
        </div>
        <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.75rem' }}>
          {t('viz_values_label', 'Values')}:{' '}
          <input
            type="text"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setStep(0);
            }}
            aria-label={t('viz_values_label', 'Values')}
            data-testid="viz-values"
            style={{
              fontFamily: 'var(--font-mono)',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--foreground)',
              width: 220,
            }}
          />
        </label>
        <div
          style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', flexWrap: 'wrap' }}
          data-testid="viz-bars"
        >
          {frame.array.map((value, i) => {
            const isCompared =
              frame.compared !== null && (frame.compared[0] === i || frame.compared[1] === i);
            const isSorted = frame.sortedUpTo !== null && i >= frame.sortedUpTo;
            return (
              <Bar
                key={`${i}-${value}`}
                value={value}
                max={max}
                state={
                  isCompared
                    ? frame.swapped
                      ? 'swapped'
                      : 'compared'
                    : isSorted
                      ? 'sorted'
                      : 'idle'
                }
              />
            );
          })}
        </div>
        <div
          data-testid="viz-note"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            color: 'var(--text-tertiary)',
            margin: '8px 0',
          }}
        >
          {frame.note} ({Math.min(step, frames.length - 1) + 1}/{frames.length})
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            data-testid="viz-prev"
          >
            ← {t('viz_prev', 'Prev')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setStep((s) => Math.min(frames.length - 1, s + 1))}
            data-testid="viz-next"
          >
            {t('viz_next', 'Next')} →
          </button>
          <button type="button" className="btn" onClick={() => setStep(0)}>
            ↺ {t('viz_reset', 'Reset')}
          </button>
        </div>
      </section>

      <section
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem 1.5rem',
        }}
        data-testid="viz-search"
      >
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.75rem' }}>
          {t('viz_search_title', 'Binary search')}
        </h2>
        <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.75rem' }}>
          {t('viz_target_label', 'Target')}:{' '}
          <input
            type="number"
            value={target}
            onChange={(e) => {
              setTarget(parseInt(e.target.value, 10) || 0);
              setStep(0);
            }}
            aria-label={t('viz_target_label', 'Target')}
            data-testid="viz-target"
            style={{
              fontFamily: 'var(--font-mono)',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--foreground)',
              width: 90,
            }}
          />
        </label>
        <div
          style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', flexWrap: 'wrap' }}
          data-testid="viz-search-bars"
        >
          {searchFrame.array.map((value, i) => {
            const inside = i >= searchFrame.lo && i <= searchFrame.hi;
            const isMid = searchFrame.mid === i;
            return (
              <Bar
                key={`${i}-${value}`}
                value={value}
                max={max}
                state={isMid ? 'compared' : inside ? 'inside' : 'outside'}
              />
            );
          })}
        </div>
        <div
          data-testid="viz-search-note"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', margin: '8px 0' }}
        >
          {searchFrame.verdict === 'found'
            ? t('viz_found', 'found at index {{i}}', { i: searchFrame.mid })
            : searchFrame.verdict === 'absent'
              ? t('viz_absent', 'not in the array')
              : searchFrame.note}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))}>
            ← {t('viz_prev', 'Prev')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setStep((s) => Math.min(search.length - 1, s + 1))}
            data-testid="viz-search-next"
          >
            {t('viz_next', 'Next')} →
          </button>
        </div>
      </section>
    </div>
  );
}
