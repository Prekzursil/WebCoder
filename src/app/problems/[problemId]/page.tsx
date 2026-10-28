// Ported from frontend/webcoder_ui/src/pages/problems/ProblemDetailPage.tsx
// Enhanced with rich UI: difficulty badge, stats bar, tabbed layout, related discussions
//
// [SPEC-GAPS appearance wave] This page now: token-driven colors (no raw hex),
// responsive single-column layout below 1024px (A1, detail.module.css), copy
// buttons on sample I/O (A7 partial), prev/next + copy-link affordances (A18),
// a real error state with a back link instead of a bare red paragraph, and
// MUI icons instead of emoji glyphs in the stats bar / quick links (A9 partial).

import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { createTranslator, getLocale, PublicLocale } from '../../_lib/public-i18n';
import { getProblemDetail, getProblems } from '../_lib/problems-api';
import SubmitSolutionForm from './SubmitSolutionForm';
import HintsPanel from './HintsPanel';
import EditoralPanelPlaceholder from './EditorialPanel';
import ProblemStatsPanel from './ProblemStatsPanel';
import CommunityEditorialsPanel from './CommunityEditorialsPanel';
import RelatedArticlesStrip from './RelatedArticlesStrip';
import ScratchPanel from './ScratchPanel';
import CopyButton from '@/components/common/CopyButton';
import StatementMarkdown from '@/components/common/StatementMarkdown';
import BookmarkButton from './BookmarkButton';
import { ProblemType } from '@/types';
import Link from 'next/link';
import { palette, hexAlpha } from '@/theme/tokens';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import MemoryOutlinedIcon from '@mui/icons-material/MemoryOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import styles from './detail.module.css';

interface ProblemDetailPageProps {
  params: Promise<{ problemId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function localizedTitle(problem: ProblemType, locale: PublicLocale, fallback: string): string {
  return problem.title_i18n[locale] || problem.title_i18n.en || fallback;
}

export async function generateMetadata({
  params,
}: ProblemDetailPageProps): Promise<Metadata> {
  const { problemId } = await params;
  const locale = await getLocale();
  const t = createTranslator(locale);

  let problem: ProblemType | null = null;
  try {
    problem = await getProblemDetail(problemId);
  } catch {
    return { title: t('problem_not_found', 'Problem not found.') };
  }

  if (!problem) {
    return { title: t('problem_not_found', 'Problem not found.') };
  }

  const title = localizedTitle(
    problem,
    locale,
    `${t('problem_id_label', 'Problem ID')}: ${problem.id}`
  );
  const statement =
    problem.statement_i18n?.[locale] || problem.statement_i18n?.en || '';
  const description =
    statement.replace(/\s+/g, ' ').trim().slice(0, 160) ||
    t('solve_problem_description', 'Solve this problem on WebCoder.');

  return { title, description };
}

const difficultyConfig: Record<string, { color: string }> = {
  easy: { color: palette.success },
  medium: { color: palette.warn },
  hard: { color: palette.danger },
};

export default async function ProblemDetailPage({
  params,
  searchParams,
}: ProblemDetailPageProps) {
  const { problemId } = await params;
  // CON-1: arriving from a running contest carries the contest id so the
  // submit form routes through the contest gate + judge-contest lane.
  const query = (await searchParams) ?? {};
  const rawContest = Array.isArray(query.contest) ? query.contest[0] : query.contest;
  const contestId = rawContest ? Number.parseInt(rawContest, 10) : null;
  const locale = await getLocale();
  const t = createTranslator(locale);

  let problem: ProblemType | null = null;
  try {
    problem = await getProblemDetail(problemId);
  } catch (err) {
    return (
      <div className="page-container">
        <div
          role="alert"
          style={{
            padding: '1.5rem',
            borderRadius: 'var(--radius-lg)',
            background: hexAlpha(palette.danger, 0.08),
            border: `1px solid ${hexAlpha(palette.danger, 0.2)}`,
            color: 'var(--danger)',
            fontSize: '0.9rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            alignItems: 'flex-start',
          }}
        >
          <div>
            {t('error_loading_problem', 'Failed to load problem.')}
            {err instanceof Error && err.message ? ` ${err.message}` : ''}
          </div>
          <Link href="/problems" className="btn">
            {t('back_to_problems', 'Back to Problems')}
          </Link>
        </div>
      </div>
    );
  }

  if (!problem) {
    notFound();
  }

  // Prev/next neighbors by problem id [A18]. Best-effort: any catalog fetch
  // failure simply hides the pager.
  let prevId: number | null = null;
  let nextId: number | null = null;
  try {
    const all = await getProblems();
    const ids = all.map((p) => p.id).sort((a, b) => a - b);
    const idx = ids.indexOf(problem.id);
    if (idx > 0) prevId = ids[idx - 1];
    if (idx !== -1 && idx < ids.length - 1) nextId = ids[idx + 1];
  } catch {
    // Catalog unavailable — prev/next stays hidden.
  }

  const problemTitle = localizedTitle(
    problem,
    locale,
    `${t('problem_id_label', 'Problem ID')}: ${problem.id}`
  );
  const problemStatement =
    problem.statement_i18n?.[locale] || problem.statement_i18n?.en || '';
  const sampleTestCases = problem.test_cases?.filter((tc) => tc.is_sample) || [];
  const diffKey = problem.difficulty?.toLowerCase() ?? 'medium';
  const diffCfg = difficultyConfig[diffKey] ?? difficultyConfig.medium;

  const sectionBar = (color: string) => ({
    width: '3px',
    height: '14px',
    background: color,
    borderRadius: '2px',
    display: 'inline-block',
    flexShrink: 0,
  } as CSSProperties);

  const sectionHeader = (color: string, label: string) => (
    <h2
      className="micro-label"
      style={{
        fontSize: '0.8rem',
        fontWeight: 700,
        color: 'var(--muted)',
        letterSpacing: '0.07em',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <span style={sectionBar(color)} aria-hidden="true" />
      {label}
    </h2>
  );

  const statBlock = (
    icon: ReactNode,
    label: string,
    children: ReactNode
  ) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ color: 'var(--muted)', display: 'inline-flex' }} aria-hidden="true">{icon}</span>
      <div>
        <div
          className="micro-label"
          style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}
        >
          {label}
        </div>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--foreground)' }}>{children}</div>
      </div>
    </div>
  );

  const card: CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '1.5rem',
    marginBottom: '1.25rem',
  };

  return (
    <div className="page-container">
      {/* Breadcrumb + share [A18] */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem', fontSize: '0.8rem', color: 'var(--muted)', flexWrap: 'wrap' }}>
        <Link href="/problems" style={{ color: 'var(--accent)' }}>Problems</Link>
        <span aria-hidden="true">›</span>
        <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>{problemTitle}</span>
        <span style={{ marginLeft: 'auto' }}>
          <CopyButton shareLink label={t('copy_link_button', 'Copy link')} />
        </span>
      </div>

      {/* Responsive two-column layout [A1] */}
      <div className={styles.detailGrid}>
        {/* Left: problem content */}
        <div>
          {/* Problem header card */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  <span className="micro-label" style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>#{problem.id}</span>
                  <span style={{
                    padding: '2px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
                    color: diffCfg.color, background: hexAlpha(diffCfg.color, 0.1), border: `1px solid ${hexAlpha(diffCfg.color, 0.25)}`,
                    textTransform: 'capitalize',
                  }}>
                    {t(`difficulty_${diffKey}`, problem.difficulty)}
                  </span>
                  <BookmarkButton problemId={problemId} />
                  {problem.status && (
                    <span style={{
                      padding: '2px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
                      color: 'var(--muted)', background: hexAlpha(palette.muted, 0.1), border: `1px solid ${hexAlpha(palette.muted, 0.2)}`,
                      textTransform: 'capitalize',
                    }}>{problem.status}</span>
                  )}
                </div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--foreground)', letterSpacing: '-0.02em', lineHeight: 1.3 }}>
                  {problemTitle}
                </h1>
              </div>
            </div>

            {/* Stats bar */}
            <div style={{
              display: 'flex', gap: '1.5rem', flexWrap: 'wrap',
              paddingTop: '1rem', borderTop: '1px solid var(--border)',
            }}>
              {problem.default_time_limit_ms != null && (
                statBlock(
                  <TimerOutlinedIcon fontSize="small" />,
                  t('time_limit_label', 'Time Limit'),
                  <>{problem.default_time_limit_ms} ms</>
                )
              )}
              {problem.default_memory_limit_kb != null && (
                statBlock(
                  <MemoryOutlinedIcon fontSize="small" />,
                  t('memory_limit_label', 'Memory Limit'),
                  <>{problem.default_memory_limit_kb} KB</>
                )
              )}
              {problem.allowed_languages && problem.allowed_languages.length > 0 && (
                statBlock(
                  <CodeOutlinedIcon fontSize="small" />,
                  t('problem_form_allowed_languages', 'Languages'),
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                    {problem.allowed_languages.map((lang) => (
                      <span key={lang} style={{
                        fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: '4px',
                        color: 'var(--violet)', background: hexAlpha(palette.violet, 0.1), border: `1px solid ${hexAlpha(palette.violet, 0.2)}`,
                        fontFamily: 'var(--font-mono)',
                      }}>{lang}</span>
                    ))}
                  </div>
                )
              )}
              {problem.author && (
                statBlock(
                  <PersonOutlineOutlinedIcon fontSize="small" />,
                  t('problem_author_label', 'Author'),
                  <span style={{ fontWeight: 600, color: 'var(--muted)' }}>{problem.author.username}</span>
                )
              )}
            </div>
          </div>

          {/* Catalog honesty [UXP-7/X9]: tried/solved/AC% + satisfaction */}
          <ProblemStatsPanel problemId={problemId} />

          {/* Wave C [EDT-3/EDT-4/EDT-6]: community editorials + related reading */}
          <CommunityEditorialsPanel problemId={Number(problemId)} />
          <RelatedArticlesStrip problemId={Number(problemId)} />

          {/* Problem statement */}
          <div style={card}>
            {sectionHeader('var(--accent)', t('problem_statement_header', 'Problem Statement'))}
            {problemStatement ? (
              <StatementMarkdown markdown={problemStatement} />
            ) : (
              <div style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                {t('empty_statement', 'No statement available.')}
              </div>
            )}
          </div>

          {/* Hints ladder [EDT-2] + editorial [EDT-1] */}
          {(() => {
            const hints = (locale === 'ro' ? problem.hints_ro : problem.hints_en) ?? [];
            return hints.length > 0 ? <HintsPanel hints={hints} /> : null;
          })()}
          {problem.has_editorial && (
            <div style={card}>
              {sectionHeader('var(--success)', t('editorial_header', 'Editorial'))}
              <EditoralPanelPlaceholder
                problemId={problemId}
                hasEditorial={Boolean(problem.has_editorial)}
                locale={locale}
              />
            </div>
          )}

          {/* Sample test cases */}
          {sampleTestCases.length > 0 && (
            <div style={card}>
              {sectionHeader(palette.warn, t('sample_test_cases_header', 'Sample Test Cases'))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {sampleTestCases.map((tc, index) => (
                  <div key={index} style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                  }}>
                    <div className={styles.sampleHead} style={{
                      padding: '6px 14px', background: 'rgba(255,255,255,0.03)',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <span className="micro-label" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em' }}>
                        {t('example_label', 'Example {{n}}', { n: index + 1 })}
                      </span>
                      <CopyButton text={tc.input_data} style={{}} />
                    </div>
                    <div className={styles.sampleGrid}>
                      <div style={{ padding: '1rem', borderRight: '1px solid var(--border)' }}>
                        <div className="micro-label" style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>
                          {t('sample_input_label', 'Input')}
                        </div>
                        <pre style={{
                          margin: 0, fontSize: '0.82rem', color: 'var(--foreground)',
                          fontFamily: 'var(--font-mono)',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                        }}>{tc.input_data}</pre>
                      </div>
                      <div style={{ padding: '1rem' }}>
                        <div className="micro-label" style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>
                          {t('sample_output_label', 'Output')}
                        </div>
                        <pre style={{
                          margin: 0, fontSize: '0.82rem', color: 'var(--success)',
                          fontFamily: 'var(--font-mono)',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                        }}>{tc.expected_output_data}</pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {problem.tags && problem.tags.length > 0 && (
            <div style={{ ...card, padding: '1.25rem 1.5rem' }}>
              {sectionHeader(palette.violet, t('tags_header', 'Tags'))}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {problem.tags.map((tag) => (
                  <span key={tag.id} style={{
                    padding: '4px 12px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 600,
                    color: 'var(--violet)', background: hexAlpha(palette.violet, 0.1), border: `1px solid ${hexAlpha(palette.violet, 0.2)}`,
                  }}>
                    {tag.name_i18n[locale] || tag.name_i18n.en || tag.slug}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Prev / next navigation [A18] */}
          {(prevId != null || nextId != null) && (
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              {prevId != null ? (
                <Link href={`/problems/${prevId}`} className="btn">
                  <ArrowBackIcon fontSize="small" />
                  {t('previous_problem', 'Previous problem')}
                </Link>
              ) : <span />}
              {nextId != null && (
                <Link href={`/problems/${nextId}`} className="btn">
                  {t('next_problem', 'Next problem')}
                  <ArrowForwardIcon fontSize="small" />
                </Link>
              )}
            </div>
          )}

          {/* Forum link */}
          <div style={{
            background: hexAlpha(palette.accent, 0.05),
            border: `1px solid ${hexAlpha(palette.accent, 0.15)}`,
            borderRadius: 'var(--radius-md)',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: '0.2rem' }}>
                {t('discuss_problem_title', 'Discuss this problem')}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                {t('discuss_problem_body', 'Ask for hints or share your approach in the community forum.')}
              </div>
            </div>
            <Link href="/forum?category=help" className="btn btn--primary" style={{ whiteSpace: 'nowrap' }}>
              {t('go_to_forum_button', 'Go to Forum →')}
            </Link>
          </div>
        </div>

        {/* Right: submit solution */}
        <div className={styles.submitColumn}>
          <div style={card}>
            {sectionHeader('var(--success)', t('submit_solution_header', 'Submit Solution'))}
            <SubmitSolutionForm
              problemId={problemId}
              allowedLanguages={problem.allowed_languages || []}
              problemTitle={problemTitle}
              contestId={contestId}
            />
          </div>

          {/* Custom test [X7]: run on your own input, no submission spent */}
          <div style={card}>
            {sectionHeader(palette.violet, t('scratch_header', 'Custom Test'))}
            <ScratchPanel allowedLanguages={problem.allowed_languages || []} />
          </div>

          {/* Quick links */}
          <div style={{ ...card, padding: '1.25rem', marginTop: '1rem' }}>
            <div className="micro-label" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: '0.75rem' }}>
              {t('quick_links_header', 'Quick Links')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[
                { href: '/my-submissions', label: t('quick_link_my_submissions', 'My Submissions'), color: 'var(--accent)' },
                { href: '/submission-history', label: t('quick_link_submission_history', 'Submission History'), color: 'var(--violet)' },
                { href: '/leaderboard', label: t('quick_link_leaderboard', 'Leaderboard'), color: 'var(--warn)' },
                { href: '/forum', label: t('quick_link_forum', 'Community Forum'), color: 'var(--success)' },
              ].map((link) => (
                <Link key={link.href} href={link.href} className="nav-link" style={{ color: link.color, fontSize: '0.8rem', minHeight: '38px' }}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
