'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { CommunityService } from '@/services/ApiService';
import { WaHelpRow } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { palette } from '@/theme/tokens';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';

/**
 * Item 64 — the explain-my-WA queue: stuck solvers ask about a failed
 * submission; helpers answer; the asker accepts one answer.
 */
export default function WaHelpPage() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const lang = i18n.language === 'ro' ? 'ro' : 'en';
  const [rows, setRows] = useState<WaHelpRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState('');
  const [question, setQuestion] = useState('');
  const [answerDrafts, setAnswerDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const response = await CommunityService.getWaHelpQueue();
      setRows(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ask = async () => {
    const id = Number(submissionId);
    if (!Number.isInteger(id) || !question.trim()) return;
    setBusy(true);
    try {
      await CommunityService.createWaHelpRequest(id, question.trim());
      setSubmissionId('');
      setQuestion('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  const answer = async (requestId: number) => {
    const body = (answerDrafts[requestId] || '').trim();
    if (!body) return;
    setBusy(true);
    try {
      await CommunityService.answerWaHelp(requestId, body);
      setAnswerDrafts((drafts) => ({ ...drafts, [requestId]: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  const accept = async (requestId: number, answerId: number) => {
    setBusy(true);
    try {
      await CommunityService.acceptWaHelp(requestId, answerId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader
        title={t('wa_help_title', 'Explain my WA')}
        subtitle={t(
          'wa_help_subtitle',
          'Stuck on a wrong answer? Ask the community to spot the bug.',
        )}
      />

      {auth.isAuthenticated && (
        <section
          style={{
            border: `1px solid ${palette.border}`,
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
          }}
          data-testid="wa-help-ask"
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={submissionId}
              onChange={(e) => setSubmissionId(e.target.value)}
              placeholder={t('wa_help_submission', 'Your failed submission #')}
              aria-label={t('wa_help_submission', 'Your failed submission #')}
              style={{ width: 220, padding: '8px 10px' }}
              data-testid="wa-help-submission-input"
            />
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t('wa_help_question', 'What is confusing you?')}
              aria-label={t('wa_help_question', 'What is confusing you?')}
              style={{ flex: 1, minWidth: 240, padding: '8px 10px' }}
              data-testid="wa-help-question-input"
            />
            <button
              type="button"
              onClick={ask}
              disabled={busy || !question.trim() || !submissionId.trim()}
              data-testid="wa-help-submit"
            >
              {t('wa_help_ask', 'Ask')}
            </button>
          </div>
          <p style={{ color: palette.muted, fontSize: '0.8rem', margin: '6px 0 0' }}>
            {t('wa_help_hint', 'Works on your non-AC submissions — find the id on My submissions.')}
          </p>
        </section>
      )}

      {error && (
        <p role="alert" style={{ color: palette.danger }}>
          {error}
        </p>
      )}
      {rows === null ? (
        <p aria-busy="true">{t('wa_help_loading', 'Loading the queue…')}</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('wa_help_empty', 'No open requests')}
          description={t('wa_help_empty_hint', 'When someone is stuck, it shows up here.')}
        />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
          {rows.map((row) => (
            <li
              key={row.id}
              data-testid={`wa-help-row-${row.id}`}
              style={{ border: `1px solid ${palette.border}`, borderRadius: 12, padding: 14 }}
            >
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <strong>{row.asker_username}</strong>
                {row.problem_title ? (
                  <span style={{ color: palette.accent }}>
                    {String(row.problem_title[lang] ?? row.problem_title.en ?? '')}
                  </span>
                ) : null}
                <span
                  style={{
                    color: row.status === 'OPEN' ? palette.warn : palette.success,
                    fontWeight: 700,
                    fontSize: '0.8rem',
                  }}
                >
                  {row.status}
                </span>
                <Link
                  href={`/submissions/${row.submission}`}
                  style={{ marginLeft: 'auto', color: palette.muted, fontSize: '0.85rem' }}
                >
                  #{row.submission}
                </Link>
              </div>
              <p style={{ margin: '8px 0' }}>{row.question}</p>
              {row.answers.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 6 }}>
                  {row.answers.map((a) => (
                    <li
                      key={a.id}
                      data-testid={`wa-help-answer-${a.id}`}
                      style={{
                        borderLeft: `3px solid ${a.is_accepted ? palette.success : palette.border}`,
                        paddingLeft: 10,
                      }}
                    >
                      <strong>{a.author}</strong>
                      {a.is_accepted ? ` · ${t('wa_help_accepted', 'accepted')}` : ''}
                      <div style={{ whiteSpace: 'pre-wrap' }}>{a.body}</div>
                    </li>
                  ))}
                </ul>
              )}
              {auth.isAuthenticated && row.status === 'OPEN' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    value={answerDrafts[row.id] ?? ''}
                    onChange={(e) =>
                      setAnswerDrafts((drafts) => ({ ...drafts, [row.id]: e.target.value }))
                    }
                    placeholder={t('wa_help_answer_placeholder', 'Spot the bug…')}
                    aria-label={t('wa_help_answer_placeholder', 'Spot the bug…')}
                    style={{ flex: 1, padding: 8 }}
                    data-testid={`wa-help-answer-input-${row.id}`}
                  />
                  <button
                    type="button"
                    onClick={() => answer(row.id)}
                    disabled={busy || !(answerDrafts[row.id] || '').trim()}
                    data-testid={`wa-help-answer-submit-${row.id}`}
                  >
                    {t('wa_help_answer', 'Answer')}
                  </button>
                </div>
              )}
              {auth.user?.username === row.asker_username &&
                row.status === 'OPEN' &&
                row.answers.length > 0 && (
                  <button
                    type="button"
                    style={{ marginTop: 8 }}
                    onClick={() => accept(row.id, row.answers[row.answers.length - 1].id)}
                    data-testid={`wa-help-accept-${row.id}`}
                  >
                    {t('wa_help_accept', 'Accept the latest answer')}
                  </button>
                )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
