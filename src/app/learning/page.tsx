'use client';

// [wave E items 29/30/33/34/35] The learning hub — five personal
// surfaces on one page:
// - review queue (spaced repeat over your own misses),
// - practice plan (a review→weak-tag→fresh week with a rest day),
// - mistake profile (pattern signatures with bilingual hints),
// - skill graph (tag nodes + prerequisite locks + mastery),
// - theory deck (bilingual flashcards, flip on click).

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { LearningService } from '@/services/ApiService';
import type { MistakePattern, PracticePlanDay, ReviewCard, SkillNode } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { palette, hexAlpha } from '@/theme/tokens';

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '1.25rem 1.5rem',
  marginBottom: '1.25rem',
};

const sectionTitle: React.CSSProperties = {
  fontSize: '1.05rem',
  fontWeight: 800,
  letterSpacing: '-0.02em',
  marginBottom: '0.75rem',
};

export default function LearningPage(): ReactNode {
  // Mount-time snapshot keeps due-day math pure during render (react-hooks/purity).
  const [now] = useState(() => Date.now());
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const [queue, setQueue] = useState<{ due: number; results: ReviewCard[] } | null>(null);
  const [plan, setPlan] = useState<PracticePlanDay[] | null>(null);
  const [profile, setProfile] = useState<{
    summary: string;
    patterns: MistakePattern[];
  } | null>(null);
  const [skills, setSkills] = useState<SkillNode[] | null>(null);
  const [deck, setDeck] = useState<
    | {
        id: number;
        tag: string;
        front_en: string;
        back_en: string;
        front_ro: string;
        back_ro: string;
      }[]
    | null
  >(null);
  const [flipped, setFlipped] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ro = i18n.language.startsWith('ro');

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    let cancelled = false;
    LearningService.reviewQueue()
      .then((d) => !cancelled && setQueue(d))
      .catch((e) => !cancelled && setError(String(e.message ?? e)));
    LearningService.practicePlan()
      .then((d) => !cancelled && setPlan(d.days))
      .catch(() => !cancelled && setPlan([]));
    LearningService.mistakeProfile()
      .then((d) => !cancelled && setProfile({ summary: d.summary, patterns: d.patterns }))
      .catch(() => !cancelled && setProfile({ summary: '', patterns: [] }));
    LearningService.skills()
      .then((d) => !cancelled && setSkills(d.nodes))
      .catch(() => !cancelled && setSkills([]));
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated]);

  useEffect(() => {
    let cancelled = false;
    LearningService.theory()
      .then((d) => !cancelled && setDeck(d.results))
      .catch(() => !cancelled && setDeck([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!auth.isAuthenticated) {
    return (
      <div className="page-container">
        <p>{t('learning_login_required', 'Log in to see your learning surfaces.')}</p>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ paddingTop: '2.5rem' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>
        {t('learning_title', 'Your learning')}
      </h1>
      {error && <p style={{ color: palette.danger }}>{error}</p>}

      <section style={card} data-testid="review-queue">
        <h2 style={sectionTitle}>
          {t('learning_review_title', 'Review queue')}{' '}
          {queue && (
            <span style={{ color: palette.warn, fontSize: '0.85rem', fontWeight: 600 }}>
              {t('learning_due_count', '{{n}} due', { n: queue.due })}
            </span>
          )}
        </h2>
        {queue === null ? (
          <LoadingSpinner />
        ) : queue.results.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            {t('learning_review_empty', 'Nothing to review — every attempted problem is solved.')}
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {queue.results.map((c) => (
              <li
                key={c.problem_id}
                style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}
              >
                <Link href={`/problems/${c.problem_id}`}>{c.title_i18n[ro ? 'ro' : 'en']}</Link>
                <span
                  style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginLeft: '8px' }}
                >
                  {c.due
                    ? t('learning_due_now', 'due now')
                    : t('learning_due_in', 'in {{n}}d', {
                        n: Math.max(
                          0,
                          Math.ceil((new Date(c.due_at).getTime() - now) / 86_400_000),
                        ),
                      })}
                  {' · '}
                  {t('learning_stage', 'stage {{n}}', { n: c.stage })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={card} data-testid="practice-plan">
        <h2 style={sectionTitle}>{t('learning_plan_title', 'This week')}</h2>
        {plan === null ? (
          <LoadingSpinner />
        ) : (
          <ol style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '6px' }}>
            {plan.map((day) => (
              <li key={day.date} style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-tertiary)',
                    fontSize: '0.8rem',
                  }}
                >
                  {day.date.slice(5)}
                </span>
                {day.kind === null ? (
                  <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                    {t('learning_rest_day', 'rest')}
                  </span>
                ) : day.problem_id ? (
                  <Link href={`/problems/${day.problem_id}`}>
                    {day.title_i18n?.[ro ? 'ro' : 'en'] ?? day.title_i18n?.en}
                  </Link>
                ) : (
                  <span style={{ fontSize: '0.9rem' }}>
                    {t('learning_weak_tag_day', 'weakest tag: {{tag}}', { tag: day.focus_tag })}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section style={card} data-testid="mistake-profile">
        <h2 style={sectionTitle}>{t('learning_mistakes_title', 'Mistake profile')}</h2>
        {profile === null ? (
          <LoadingSpinner />
        ) : (
          <>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
              {profile.summary}
            </p>
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {profile.patterns.map((p) => (
                <li key={p.pattern} style={{ marginBottom: '6px', fontSize: '0.88rem' }}>
                  <strong>{p.evidence}</strong>
                  <div style={{ color: 'var(--text-tertiary)' }}>{ro ? p.hint_ro : p.hint_en}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section style={card} data-testid="skill-graph">
        <h2 style={sectionTitle}>{t('learning_skills_title', 'Skill graph')}</h2>
        {skills === null ? (
          <LoadingSpinner />
        ) : (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {skills.map((node) => {
              const name = node.name_i18n?.[ro ? 'ro' : 'en'] ?? node.slug;
              return (
                <span
                  key={node.slug}
                  title={
                    node.prerequisites.length
                      ? t('learning_requires', 'requires {{tags}}', {
                          tags: node.prerequisites.join(', '),
                        })
                      : name
                  }
                  style={{
                    padding: '4px 12px',
                    borderRadius: '999px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: node.unlocked ? palette.success : palette.muted,
                    background: node.unlocked
                      ? hexAlpha(palette.success, 0.1)
                      : hexAlpha(palette.muted, 0.1),
                    border: `1px solid ${
                      node.unlocked
                        ? hexAlpha(palette.success, 0.25)
                        : hexAlpha(palette.muted, 0.25)
                    }`,
                    textDecoration: node.unlocked ? 'none' : 'line-through',
                  }}
                >
                  {name}
                  {node.solved > 0 && (
                    <span style={{ fontWeight: 400, marginLeft: '4px' }}>· {node.solved}</span>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </section>

      <section style={card} data-testid="theory-deck">
        <h2 style={sectionTitle}>{t('learning_theory_title', 'Theory cards')}</h2>
        {deck === null ? (
          <LoadingSpinner />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '10px',
            }}
          >
            {deck.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => setFlipped(flipped === c.id ? null : c.id)}
                data-testid={`theory-card-${c.id}`}
                style={{
                  textAlign: 'left',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px',
                  minHeight: '110px',
                  cursor: 'pointer',
                  color: 'var(--foreground)',
                }}
              >
                <div className="micro-label" style={{ marginBottom: '4px' }}>
                  {c.tag}
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  {flipped === c.id ? (ro ? c.back_ro : c.back_en) : ro ? c.front_ro : c.front_en}
                </div>
                {flipped !== c.id && (
                  <div
                    style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem', marginTop: '6px' }}
                  >
                    {t('learning_flip_hint', 'click to flip')}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
