'use client';

// [wave E items 36/37/38/40] The drills page — three practice kinds plus
// the daily warmup:
// - READ_CODE (36): a snippet and "what does this output?";
// - COMPLEXITY (38): a snippet and its complexity;
// - MICRO (37): fill-the-line over the snippet's ___ blank;
// - DAILY (40): one drill per kind, deterministic for today.

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DrillService } from '@/services/ApiService';
import type { DrillRow } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { palette, hexAlpha } from '@/theme/tokens';

const KINDS = ['ALL', 'READ_CODE', 'COMPLEXITY', 'MICRO'] as const;

interface Outcome {
  correct: boolean;
  explanation: string;
  accepted: string[] | null;
}

function DrillCard({
  drill,
  answered,
  onAnswered,
}: {
  drill: DrillRow;
  answered: Outcome | undefined;
  onAnswered: (id: number, outcome: Outcome) => void;
}): ReactNode {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const ro = i18n.language.startsWith('ro');
  const [choice, setChoice] = useState<number | null>(null);
  const [line, setLine] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const options = (ro ? drill.options_ro : drill.options_en) ?? null;

  const submit = async () => {
    if (!auth.isAuthenticated) {
      setError(t('drills_login_to_check', 'Log in to check your answer.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const answer = drill.kind === 'MICRO' ? line : choice;
      const result = await DrillService.answer(drill.id, answer ?? '');
      onAnswered(drill.id, {
        correct: result.correct,
        explanation: ro ? result.explanation_ro : result.explanation_en,
        accepted: result.accepted,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid={`drill-${drill.id}`}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${answered?.correct ? hexAlpha(palette.success, 0.3) : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '1rem 1.25rem',
      }}
    >
      <div className="micro-label" style={{ marginBottom: '4px' }}>
        {drill.kind} · {drill.tag}
      </div>
      <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px' }}>
        {ro ? drill.question_ro : drill.question_en}
      </div>
      <pre
        style={{
          background: 'var(--surface-2)',
          padding: '10px',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8rem',
          overflowX: 'auto',
          margin: '0 0 10px',
          color: 'var(--foreground)',
        }}
      >
        {drill.code}
      </pre>
      {options ? (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {options.map((opt, i) => (
            <button
              key={opt}
              type="button"
              className="chip"
              aria-pressed={choice === i}
              onClick={() => setChoice(i)}
              style={
                choice === i
                  ? {
                      borderColor: 'var(--accent)',
                      color: 'var(--accent)',
                      background: hexAlpha(palette.accent, 0.12),
                    }
                  : undefined
              }
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <input
          type="text"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          placeholder={t('drills_micro_placeholder', 'the missing line…')}
          aria-label={t('drills_micro_placeholder', 'the missing line…')}
          style={{
            width: '100%',
            fontFamily: 'var(--font-mono)',
            padding: '8px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--foreground)',
            marginBottom: '8px',
          }}
        />
      )}
      <button
        type="button"
        className="btn"
        onClick={submit}
        disabled={busy || (options ? choice === null : !line.trim())}
      >
        {busy ? t('presubmit_running', 'Checking…') : t('drills_check', 'Check')}
      </button>
      {error && (
        <span style={{ color: palette.danger, marginLeft: '8px', fontSize: '0.8rem' }}>
          {error}
        </span>
      )}
      {answered && (
        <div style={{ marginTop: '8px', fontSize: '0.85rem' }}>
          <strong style={{ color: answered.correct ? palette.success : palette.danger }}>
            {answered.correct ? t('drills_correct', 'Correct!') : t('drills_wrong', 'Not quite.')}
          </strong>{' '}
          {answered.explanation}
          {answered.accepted && (
            <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
              {t('drills_accepted', 'accepted')}: {answered.accepted.join(' | ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DrillsPage(): ReactNode {
  const { t } = useTranslation();
  const [kind, setKind] = useState<(typeof KINDS)[number]>('ALL');
  const [deck, setDeck] = useState<DrillRow[] | null>(null);
  const [daily, setDaily] = useState<DrillRow[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, Outcome>>({});

  useEffect(() => {
    let cancelled = false;
    DrillService.list(kind === 'ALL' ? undefined : kind)
      .then((d) => !cancelled && setDeck(d.results))
      .catch(() => !cancelled && setDeck([]));
    return () => {
      cancelled = true;
    };
  }, [kind]);

  useEffect(() => {
    let cancelled = false;
    DrillService.daily()
      .then((d) => !cancelled && setDaily(d.results))
      .catch(() => !cancelled && setDaily([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const markAnswered = useMemo(
    () => (id: number, outcome: Outcome) => setAnswers((prev) => ({ ...prev, [id]: outcome })),
    [],
  );

  return (
    <div className="page-container" style={{ paddingTop: '2.5rem' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>
        {t('drills_title', 'Drills')}
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>
        {t(
          'drills_intro',
          'Two-minute practice between problems: read the code, judge the complexity, fill the line.',
        )}
      </p>

      {daily !== null && daily.length > 0 && (
        <section style={{ marginBottom: '1.5rem' }} data-testid="daily-warmup">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.6rem' }}>
            ☀️ {t('drills_daily_title', "Today's warmup")}
          </h2>
          <div style={{ display: 'grid', gap: '10px' }}>
            {daily.map((d) => (
              <DrillCard
                key={`daily-${d.id}`}
                drill={d}
                answered={answers[d.id]}
                onAnswered={markAnswered}
              />
            ))}
          </div>
        </section>
      )}

      <div style={{ display: 'flex', gap: '6px', marginBottom: '1rem' }}>
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className="chip"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            style={
              kind === k
                ? {
                    borderColor: 'var(--accent)',
                    color: 'var(--accent)',
                    background: hexAlpha(palette.accent, 0.12),
                  }
                : undefined
            }
          >
            {k === 'ALL' ? t('solutions_all_languages', 'all') : k}
          </button>
        ))}
      </div>

      {deck === null ? (
        <LoadingSpinner />
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {deck.map((d) => (
            <DrillCard key={d.id} drill={d} answered={answers[d.id]} onAnswered={markAnswered} />
          ))}
        </div>
      )}
    </div>
  );
}
