'use client';

// [roadmap EDT-1 / QW-8 → problem-page wave item E] Editorial panel with
// AFTER_AC gating: the backend returns 403 + locked:true while the
// publish policy hides the content (solve it first), 404 when no
// editorial exists. Locked state is honest UI, not an error — and the
// early-unlock lane points at the source-code forfeit modal (item F):
// forfeiting permanently reveals BOTH the editorial and the source.
//
// The open state renders the walkthrough as markdown + KaTeX +
// highlighted code, with the mandatory reference implementations
// (Python and C++) under the body.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { ProblemService } from '@/services/ApiService';
import StatementMarkdown from '@/components/common/StatementMarkdown';
import { palette, hexAlpha } from '@/theme/tokens';

type EditorialState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'locked'; policy: string }
  | {
      kind: 'open';
      content: string;
      solutionPython: string;
      solutionCpp: string;
    };

export default function EditorialPanel({
  problemId,
  hasEditorial,
  locale,
  onUnlockEarly,
  reloadKey = 0,
}: {
  problemId: string;
  hasEditorial: boolean;
  locale: 'en' | 'ro';
  onUnlockEarly?: () => void;
  /** Bump to re-run the fetch (e.g. after a forfeit unlocks the editorial). */
  reloadKey?: number;
}): ReactNode {
  const { t } = useTranslation();
  const [state, setState] = useState<EditorialState>({ kind: 'loading' });

  useEffect(() => {
    if (!hasEditorial) {
      setState({ kind: 'none' });
      return;
    }
    let cancelled = false;
    ProblemService.getEditorial(problemId)
      .then((editorial) => {
        if (cancelled) return;
        const content = locale === 'ro' ? editorial.content_ro : editorial.content_en;
        setState({
          kind: 'open',
          content: content || editorial.content_en || editorial.content_ro,
          solutionPython: editorial.solution_python ?? '',
          solutionCpp: editorial.solution_cpp ?? '',
        });
      })
      .catch((err: { responseLocked?: boolean; policy?: string; notFound?: boolean }) => {
        if (cancelled) return;
        if (err?.notFound) setState({ kind: 'none' });
        else if (err?.responseLocked)
          setState({ kind: 'locked', policy: err.policy ?? 'AFTER_AC' });
        else setState({ kind: 'none' });
      });
    return () => {
      cancelled = true;
    };
  }, [problemId, hasEditorial, locale, reloadKey]);

  if (!hasEditorial || state.kind === 'none') return null;

  if (state.kind === 'locked') {
    return (
      <div
        data-testid="editorial-locked"
        style={{
          display: 'grid',
          gap: '0.6rem',
          padding: '1rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          background: hexAlpha(palette.muted, 0.06),
          border: `1px solid ${hexAlpha(palette.muted, 0.2)}`,
          color: 'var(--muted)',
          fontSize: '0.85rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <LockOutlinedIcon fontSize="small" />
          {state.policy === 'AFTER_AC'
            ? t('editorial_locked_after_ac', 'Editorial is locked until you solve this problem.')
            : t('editorial_locked_manual', 'Editorial is not public yet.')}
        </div>
        {state.policy === 'AFTER_AC' && onUnlockEarly && (
          <button
            type="button"
            className="btn"
            data-testid="editorial-unlock-early"
            style={{
              justifySelf: 'start',
              padding: '4px 12px',
              fontSize: '0.75rem',
              minHeight: '30px',
            }}
            onClick={onUnlockEarly}
          >
            {t('editorial_unlock_early', 'Unlock early (forfeits points) →')}
          </button>
        )}
      </div>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
        {t('loading_editorial', 'Loading editorial…')}
      </div>
    );
  }

  const codeBlock = (label: string, language: 'python' | 'cpp', code: string): ReactNode =>
    code ? (
      <div data-testid={`editorial-solution-${language}`} style={{ display: 'grid', gap: '4px' }}>
        <div className="micro-label" style={{ color: 'var(--muted)' }}>
          {label}
        </div>
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus}
          customStyle={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8rem',
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    ) : null;

  return (
    <div data-testid="editorial-open" style={{ display: 'grid', gap: '0.9rem' }}>
      <StatementMarkdown markdown={state.content} />
      {codeBlock(
        t('editorial_solution_python', 'Reference solution — Python'),
        'python',
        state.solutionPython,
      )}
      {codeBlock(t('editorial_solution_cpp', 'Reference solution — C++'), 'cpp', state.solutionCpp)}
    </div>
  );
}
