// Ported from frontend/webcoder_ui/src/pages/problems/ProblemDetailPage.tsx
// Enhanced with rich UI: difficulty badge, stats bar, tabbed layout, related discussions

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createTranslator, getLocale, PublicLocale } from '../../_lib/public-i18n';
import { getProblemDetail } from '../_lib/problems-api';
import SubmitSolutionForm from './SubmitSolutionForm';
import { ProblemType } from '@/types';
import Link from 'next/link';

interface ProblemDetailPageProps {
  params: Promise<{ problemId: string }>;
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

const difficultyConfig: Record<string, { color: string; bg: string; border: string }> = {
  easy:   { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.25)' },
  medium: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.25)' },
  hard:   { color: '#f87171', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.25)' },
};

export default async function ProblemDetailPage({ params }: ProblemDetailPageProps) {
  const { problemId } = await params;
  const locale = await getLocale();
  const t = createTranslator(locale);

  let problem: ProblemType | null = null;
  try {
    problem = await getProblemDetail(problemId);
  } catch (err) {
    return (
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{
          padding: '1.25rem 1.5rem', borderRadius: '10px',
          background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
          color: '#f87171', fontSize: '0.9rem',
        }}>
          {err instanceof Error ? err.message : 'Failed to load problem.'}
        </div>
      </div>
    );
  }

  if (!problem) {
    notFound();
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

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem', fontSize: '0.8rem', color: '#64748b' }}>
        <Link href="/problems" style={{ color: '#38bdf8' }}>Problems</Link>
        <span>›</span>
        <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>{problemTitle}</span>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left: problem content */}
        <div>
          {/* Problem header card */}
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.25rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 600 }}>#{problem.id}</span>
                  <span style={{
                    padding: '2px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
                    color: diffCfg.color, background: diffCfg.bg, border: `1px solid ${diffCfg.border}`,
                    textTransform: 'capitalize',
                  }}>
                    {t(`difficulty_${diffKey}`, problem.difficulty)}
                  </span>
                  {problem.status && (
                    <span style={{
                      padding: '2px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
                      color: '#64748b', background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)',
                      textTransform: 'capitalize',
                    }}>{problem.status}</span>
                  )}
                </div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em', lineHeight: 1.3 }}>
                  {problemTitle}
                </h1>
              </div>
            </div>

            {/* Stats bar */}
            <div style={{
              display: 'flex', gap: '1.5rem', flexWrap: 'wrap',
              paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              {problem.default_time_limit_ms && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.8rem' }}>⏱</span>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time Limit</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f1f5f9' }}>{problem.default_time_limit_ms} ms</div>
                  </div>
                </div>
              )}
              {problem.default_memory_limit_kb && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.8rem' }}>💾</span>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Memory Limit</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f1f5f9' }}>{problem.default_memory_limit_kb} KB</div>
                  </div>
                </div>
              )}
              {problem.allowed_languages && problem.allowed_languages.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.8rem' }}>🔧</span>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Languages</div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                      {problem.allowed_languages.map(lang => (
                        <span key={lang} style={{
                          fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: '4px',
                          color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)',
                          fontFamily: 'monospace',
                        }}>{lang}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {problem.author && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.8rem' }}>✍️</span>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Author</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8' }}>{problem.author.username}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Problem statement */}
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.25rem',
          }}>
            <h2 style={{
              fontSize: '0.8rem', fontWeight: 700, color: '#64748b',
              textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1rem',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <span style={{ width: '3px', height: '14px', background: '#38bdf8', borderRadius: '2px', display: 'inline-block' }} />
              {t('problem_statement_header', 'Problem Statement')}
            </h2>
            <div style={{
              fontSize: '0.9rem', color: '#cbd5e1', lineHeight: 1.8,
              whiteSpace: 'pre-wrap', fontFamily: 'inherit',
            }}>
              {problemStatement || <span style={{ color: '#475569', fontStyle: 'italic' }}>No statement available.</span>}
            </div>
          </div>

          {/* Sample test cases */}
          {sampleTestCases.length > 0 && (
            <div style={{
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '1.25rem',
            }}>
              <h2 style={{
                fontSize: '0.8rem', fontWeight: 700, color: '#64748b',
                textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1rem',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <span style={{ width: '3px', height: '14px', background: '#fbbf24', borderRadius: '2px', display: 'inline-block' }} />
                {t('sample_test_cases_header', 'Sample Test Cases')}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {sampleTestCases.map((tc, index) => (
                  <div key={index} style={{
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '6px 14px', background: 'rgba(255,255,255,0.03)',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      fontSize: '0.72rem', fontWeight: 700, color: '#64748b',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      Example {index + 1}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                      <div style={{ padding: '1rem', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                          {t('sample_input_label', 'Input')}
                        </div>
                        <pre style={{
                          margin: 0, fontSize: '0.82rem', color: '#e2e8f0',
                          fontFamily: 'JetBrains Mono, Consolas, monospace',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                        }}>{tc.input_data}</pre>
                      </div>
                      <div style={{ padding: '1rem' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                          {t('sample_output_label', 'Output')}
                        </div>
                        <pre style={{
                          margin: 0, fontSize: '0.82rem', color: '#4ade80',
                          fontFamily: 'JetBrains Mono, Consolas, monospace',
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
            <div style={{
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              padding: '1.25rem 1.5rem',
              marginBottom: '1.25rem',
            }}>
              <h2 style={{
                fontSize: '0.8rem', fontWeight: 700, color: '#64748b',
                textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.75rem',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <span style={{ width: '3px', height: '14px', background: '#a78bfa', borderRadius: '2px', display: 'inline-block' }} />
                Tags
              </h2>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {problem.tags.map(tag => (
                  <span key={tag.id} style={{
                    padding: '4px 12px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 600,
                    color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)',
                  }}>
                    {tag.name_i18n[locale] || tag.name_i18n.en || tag.slug}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Forum link */}
          <div style={{
            background: 'rgba(56,189,248,0.05)',
            border: '1px solid rgba(56,189,248,0.15)',
            borderRadius: '10px',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.2rem' }}>💬 Discuss this problem</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Ask for hints or share your approach in the community forum.</div>
            </div>
            <Link href="/forum?category=help" style={{
              padding: '7px 16px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700,
              background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.25)',
              color: '#38bdf8', textDecoration: 'none', whiteSpace: 'nowrap',
            }}>Go to Forum →</Link>
          </div>
        </div>

        {/* Right: submit solution */}
        <div style={{ position: 'sticky', top: '80px' }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '12px',
            padding: '1.5rem',
          }}>
            <h2 style={{
              fontSize: '0.8rem', fontWeight: 700, color: '#64748b',
              textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '1.25rem',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <span style={{ width: '3px', height: '14px', background: '#4ade80', borderRadius: '2px', display: 'inline-block' }} />
              {t('submit_solution_header', 'Submit Solution')}
            </h2>
            <SubmitSolutionForm
              problemId={problemId}
              allowedLanguages={problem.allowed_languages || []}
              problemTitle={problemTitle}
            />
          </div>

          {/* Quick links */}
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '12px',
            padding: '1.25rem',
            marginTop: '1rem',
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>Quick Links</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[
                { href: '/my-submissions', label: '📋 My Submissions', color: '#38bdf8' },
                { href: '/submission-history', label: '📊 Submission History', color: '#a78bfa' },
                { href: '/leaderboard', label: '🏆 Leaderboard', color: '#fbbf24' },
                { href: '/forum', label: '💬 Community Forum', color: '#4ade80' },
              ].map(link => (
                <Link key={link.href} href={link.href} style={{
                  padding: '8px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 500,
                  color: link.color, textDecoration: 'none',
                  background: 'rgba(255,255,255,0.02)',
                  display: 'block', transition: 'background 150ms ease',
                }}>{link.label}</Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
