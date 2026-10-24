// [roadmap ONB-1 / round-2 Wave A] First-run onboarding: the guided
// "make your first submission" path. Three classic starters — one easy
// problem per paradigm, chosen by the backend from the curriculum tree —
// with a 1-2-3 how-it-works strip, so a brand-new learner has a first-hour
// path instead of an undirected catalog.

import type { Metadata } from 'next';
import Link from 'next/link';
import { createTranslator, getLocale } from '../_lib/public-i18n';
import { getStarterProblems } from '../problems/_lib/problems-api';
import { palette, hexAlpha } from '@/theme/tokens';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import TerminalOutlinedIcon from '@mui/icons-material/TerminalOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getLocale());
  return {
    title: t('start_page_title', 'Start here — your first submission in 3 steps'),
    description: t(
      'start_page_description',
      'A guided first hour on WebCoder: pick a classic starter, write code in the editor, and get judged instantly.'
    ),
  };
}

const STEPS = [
  {
    key: 'pick',
    icon: <PlayArrowOutlinedIcon />,
  },
  {
    key: 'code',
    icon: <TerminalOutlinedIcon />,
  },
  {
    key: 'judged',
    icon: <EmojiEventsOutlinedIcon />,
  },
] as const;

export default async function StartPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);

  let starters: Awaited<ReturnType<typeof getStarterProblems>> = [];
  let loadError: string | null = null;
  try {
    starters = await getStarterProblems();
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Failed to load starters.';
  }

  return (
    <div className="page-container" style={{ paddingTop: '2.5rem' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: 'var(--foreground)' }}>
          {t('start_hero_title', 'New here? Solve your first problem in 10 minutes.')}
        </h1>
        <p style={{ marginTop: '0.75rem', color: 'var(--muted)', fontSize: '0.95rem', maxWidth: '560px', marginInline: 'auto', lineHeight: 1.7 }}>
          {t(
            'start_hero_subtitle',
            'Three classic starters — one per idea. Write code, run it on your own input, submit, and read the hints if you get stuck.'
          )}
        </p>
      </div>

      {/* How it works */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {STEPS.map((step, index) => (
          <div
            key={step.key}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.25rem',
            }}
          >
            <div
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '34px',
                height: '34px',
                borderRadius: '999px',
                background: hexAlpha(palette.accent, 0.1),
                color: 'var(--accent)',
                marginBottom: '0.75rem',
              }}
            >
              {step.icon}
            </div>
            <div className="micro-label" style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '4px' }}>
              {t(`start_step_${step.key}_label`, `${index + 1}`)}
            </div>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.5 }}>
              {t(`start_step_${step.key}_title`, step.key)}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '4px', lineHeight: 1.6 }}>
              {t(`start_step_${step.key}_body`, step.key)}
            </div>
          </div>
        ))}
      </div>

      {/* Starter trio */}
      {loadError ? (
        <div
          role="alert"
          style={{
            padding: '1.25rem 1.5rem',
            borderRadius: 'var(--radius-md)',
            background: hexAlpha(palette.danger, 0.08),
            border: `1px solid ${hexAlpha(palette.danger, 0.2)}`,
            color: 'var(--danger)',
            fontSize: '0.9rem',
          }}
        >
          {t('start_load_error', 'Could not load the starter problems: ')}
          {loadError}
        </div>
      ) : starters.length === 0 ? (
        <div
          style={{
            padding: '1.5rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            textAlign: 'center',
          }}
        >
          {t('start_empty', 'No starters yet — the starter pack lands with the seed content.')}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          {starters.map((problem, index) => {
            const title = problem.title_i18n?.[locale] || problem.title_i18n?.en || `Problem #${problem.id}`;
            const statement =
              (problem.statement_i18n?.[locale] || problem.statement_i18n?.en || '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 140) || '';
            return (
              <Link
                key={problem.id}
                href={`/problems/${problem.id}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.25rem',
                  textDecoration: 'none',
                  transition: 'border-color 0.15s ease',
                }}
              >
                <span
                  className="micro-label"
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: 'var(--accent)',
                    letterSpacing: '0.07em',
                  }}
                >
                  {t('start_starter_badge', 'STARTER {{n}}', { n: index + 1 })}
                </span>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--foreground)' }}>{title}</span>
                {statement && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.6 }}>{statement}…</span>
                )}
                <span style={{ marginTop: 'auto', paddingTop: '0.5rem', fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent)' }}>
                  {t('start_solve_now', 'Solve it now →')}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Escalation link */}
      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <Link href="/problems" className="btn" style={{ padding: '10px 20px' }}>
          {t('start_browse_all', 'Browse the full catalog')}
        </Link>
      </div>
    </div>
  );
}
