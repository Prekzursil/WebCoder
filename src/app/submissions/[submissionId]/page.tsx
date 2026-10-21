'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { SubmissionService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import { DetailedSubmissionType, SubmissionTestResultType } from '@/types';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import CopyButton from '@/components/common/CopyButton';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { palette, hexAlpha } from '@/theme/tokens';

// Ported from frontend/webcoder_ui/src/pages/submissions/SubmissionDetailPage.tsx
// (CRA reference). Route mirrors react-router's /submissions/:submissionId
// (App.tsx:44 — PUBLIC route, auth enforced in-page, no ProtectedRoute).
//
// [SPEC-GAPS A4] Restyled from the bare CRA h4/p/strong port into the problem
// -detail visual language: cards, uppercase micro-labels, verdict pills with
// the shared verdict→color map, and a Prism code viewer with a copy button
// (F20). Fetch errors now get a back link + retry instead of bare text.
//
// Next.js adaptations preserved from the original port: useParams from
// next/navigation; getSubmissionDetail consumed directly; the 3-second polling
// loop while verdict is PENDING/COMPILING/RUNNING including cleanup.

const VERDICT_COLORS: Record<string, string> = {
  AC: palette.success,
  WA: palette.danger,
  TLE: palette.warn,
  MLE: palette.warn,
  CE: palette.orange,
  RE: palette.danger,
  IE: palette.danger,
  PENDING: palette.muted,
  COMPILING: palette.muted,
  RUNNING: palette.accent,
};

function verdictColor(verdict: string | undefined): string {
  return (verdict && VERDICT_COLORS[verdict]) || palette.muted;
}

function VerdictPill({ verdict }: { verdict: string | undefined }) {
  const color = verdictColor(verdict);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 12px',
        borderRadius: '999px',
        fontSize: '0.78rem',
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        color,
        background: hexAlpha(color, 0.1),
        border: `1px solid ${hexAlpha(color, 0.25)}`,
      }}
    >
      {verdict ?? '—'}
    </span>
  );
}

function SubmissionDetailPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const [submission, setSubmission] = useState<DetailedSubmissionType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);

  const languageMap: { [key: string]: string } = { python3: 'python', cpp17: 'cpp', java11: 'java' };
  const getSyntaxHighlighterLanguage = (langIdentifier: string): string =>
    languageMap[langIdentifier.toLowerCase()] || 'plaintext';

  const fetchDetails = useCallback(async (currentSubmissionId: string) => {
    try {
      const data = await SubmissionService.getSubmissionDetail(currentSubmissionId);
      setSubmission(data);
      if (data && (data.verdict === 'PENDING' || data.verdict === 'COMPILING' || data.verdict === 'RUNNING')) {
        setIsPolling(true);
      } else {
        setIsPolling(false);
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('error_loading_submission_detail', 'Failed to load submission details.'));
      setIsPolling(false);
    }
  }, [t]);

  useEffect(() => {
    if (submissionId && auth.token) {
      setLoading(true);
      setError(null);
      fetchDetails(submissionId).finally(() => setLoading(false));
    } else if (!auth.token) {
      setError(t('error_auth_required_submission', 'Authentication required to view submission details.'));
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, auth.token, t]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined = undefined;
    if (isPolling && submissionId && auth.token) {
      intervalId = setInterval(() => {
        fetchDetails(submissionId);
      }, 3000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPolling, submissionId, auth.token, t]);

  const microLabel: React.CSSProperties = {
    fontSize: '0.65rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-tertiary)',
    marginBottom: '2px',
  };

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '1.5rem',
    marginBottom: '1.25rem',
  };

  if (loading && !submission) return <LoadingSpinner />;
  if (error && !submission) {
    return (
      <div className="page-container">
        <div
          role="alert"
          style={{
            ...card,
            color: 'var(--danger)',
            background: hexAlpha(palette.danger, 0.08),
            borderColor: hexAlpha(palette.danger, 0.2),
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            alignItems: 'flex-start',
          }}
        >
          <div style={{ fontSize: '0.9rem' }}>{error}</div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* [F20] dead-end fix: a way back + a retry */}
            <Link href="/my-submissions" className="btn">
              {t('back_to_my_submissions', 'Back to My Submissions')}
            </Link>
            {submissionId && auth.token && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  fetchDetails(submissionId).finally(() => setLoading(false));
                }}
              >
                {t('try_again_button', 'Try Again')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (!submission) return <div className="page-container"><p>{t('submission_not_found', 'Submission not found.')}</p></div>;

  const problemTitle =
    submission.problem.title_i18n[i18n.language] || submission.problem.title_i18n.en || `ID: ${submission.problem.id}`;

  const metaCell = (label: string, children: React.ReactNode) => (
    <div style={{ minWidth: 0 }}>
      <div style={microLabel}>{label}</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--foreground)', fontWeight: 500 }}>{children}</div>
    </div>
  );

  const renderTestResult = (result: SubmissionTestResultType) => {
    return (
      <div key={result.id} style={card}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap',
            marginBottom: '0.75rem',
          }}
        >
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--foreground)' }}>
            {t('test_case_label', 'Test Case')} #{result.test_case_details?.order ?? result.test_case_details?.id}
            {result.test_case_details?.is_sample && (
              <span
                style={{
                  marginLeft: '8px',
                  padding: '1px 8px',
                  borderRadius: '999px',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  color: 'var(--violet)',
                  background: hexAlpha(palette.violet, 0.1),
                  border: `1px solid ${hexAlpha(palette.violet, 0.2)}`,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {t('sample_label', 'Sample')}
              </span>
            )}
          </div>
          <VerdictPill verdict={result.verdict} />
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {metaCell(t('points_label', 'Points'), <>{result.test_case_details?.points ?? '—'}</>)}
          {result.execution_time_ms !== null && result.execution_time_ms !== undefined && (
            metaCell(t('time_label', 'Time'), <>{result.execution_time_ms} ms</>)
          )}
          {result.memory_used_kb !== null && result.memory_used_kb !== undefined && (
            metaCell(t('memory_label', 'Memory'), <>{result.memory_used_kb} KB</>)
          )}
        </div>

        {result.actual_output && (result.verdict === 'WA' || result.verdict === 'RE') && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={microLabel}>{t('actual_output_label', 'Actual Output (truncated)')}</div>
            <pre
              style={{
                background: 'var(--surface-2)',
                padding: '10px',
                marginTop: '4px',
                maxHeight: '100px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                color: 'var(--foreground)',
              }}
            >
              {result.actual_output.substring(0, 200)}
              {result.actual_output.length > 200 ? '...' : ''}
            </pre>
          </div>
        )}
        {result.error_output && (result.verdict === 'RE' || result.verdict === 'CE' || result.verdict === 'IE') && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={microLabel}>{t('error_output_label', 'Error Output (truncated)')}</div>
            <pre
              style={{
                background: 'var(--surface-2)',
                padding: '10px',
                marginTop: '4px',
                maxHeight: '100px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                color: 'var(--danger)',
              }}
            >
              {result.error_output.substring(0, 200)}
              {result.error_output.length > 200 ? '...' : ''}
            </pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page-container">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1.5rem',
        }}
      >
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {t('submission_detail_header', 'Submission Detail')} #{submission.id}
          <VerdictPill verdict={submission.verdict} />
          {isPolling && (
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 400 }}>
              ({t('polling_status', 'Polling for updates...')})
            </span>
          )}
        </h1>
        {/* [F20] dead-end fix: a way back */}
        <Link href="/my-submissions" className="btn">
          {t('back_to_my_submissions', 'Back to My Submissions')}
        </Link>
      </div>

      {error && (
        <p style={{ color: 'var(--accent)', fontStyle: 'italic', marginBottom: '1rem' }}>Note: {error}</p>
      )}

      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          {metaCell(
            t('problem_label', 'Problem'),
            <Link href={`/problems/${submission.problem.id}`} style={{ color: 'var(--accent)' }}>
              {problemTitle}
            </Link>
          )}
          {submission.user && metaCell(t('user_label', 'User'), <>{submission.user.username}</>)}
          {metaCell(t('language_label', 'Language'), <span style={{ fontFamily: 'var(--font-mono)' }}>{submission.language}</span>)}
          {metaCell(
            t('verdict_label', 'Verdict'),
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: verdictColor(submission.verdict) }}>
              {submission.verdict}
            </span>
          )}
          {metaCell(t('score_label', 'Score'), <>{submission.score ?? '—'}</>)}
          {metaCell(
            t('submission_time_label', 'Submission Time'),
            <>{new Date(submission.submission_time).toLocaleString(i18n.language)}</>
          )}
          {submission.execution_time_ms !== null &&
            metaCell(t('execution_time_label', 'Execution Time (Overall)'), <>{submission.execution_time_ms} ms</>)}
          {submission.memory_used_kb !== null &&
            metaCell(t('memory_used_label', 'Memory Used (Overall)'), <>{submission.memory_used_kb} KB</>)}
        </div>
      </div>

      <h2 className="micro-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.07em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ width: '3px', height: '14px', background: 'var(--accent)', borderRadius: '2px', display: 'inline-block' }} aria-hidden="true" />
        {t('submitted_code_header', 'Submitted Code')}
      </h2>
      <div style={{ fontSize: '0.9em', maxWidth: '100%', overflowX: 'auto', marginBottom: '1.5rem', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
          <CopyButton text={submission.code} label={t('copy_code_button', 'Copy code')} />
        </div>
        <SyntaxHighlighter language={getSyntaxHighlighterLanguage(submission.language)} style={vscDarkPlus} showLineNumbers>
          {submission.code}
        </SyntaxHighlighter>
      </div>

      {submission.test_results && submission.test_results.length > 0 && (
        <>
          <h2 className="micro-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.07em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '3px', height: '14px', background: palette.warn, borderRadius: '2px', display: 'inline-block' }} aria-hidden="true" />
            {t('test_case_results_header', 'Test Case Results')}
          </h2>
          {submission.test_results.map(renderTestResult)}
        </>
      )}

      {submission.detailed_feedback && (
        <>
          <h2 className="micro-label" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.07em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '3px', height: '14px', background: palette.violet, borderRadius: '2px', display: 'inline-block' }} aria-hidden="true" />
            {t('judge_feedback_header', "Judge's Summary")}
          </h2>
          <pre
            style={{
              background: 'var(--surface)',
              padding: '12px',
              border: '1px solid var(--border)',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: 'var(--body)',
            }}
          >
            {submission.detailed_feedback}
          </pre>
        </>
      )}
    </div>
  );
}

export default SubmissionDetailPage;
