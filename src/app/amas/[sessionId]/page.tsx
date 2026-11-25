'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { CommunityService } from '@/services/ApiService';
import { AmaDetailRow } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { palette } from '@/theme/tokens';
import PageHeader from '@/components/common/PageHeader';

/**
 * Items 68 — one AMA session: questions during the live window, the
 * host's answers, upvotes. The asker side is public; answering is
 * host-only (enforced server-side too).
 */
export default function AmaSessionPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const params = useParams<{ sessionId: string }>();
  const sessionId = Number(params?.sessionId);
  const [session, setSession] = useState<AmaDetailRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answerDrafts, setAnswerDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSession(await CommunityService.getAma(sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) load();
  }, [load, sessionId]);

  const ask = async () => {
    if (!question.trim()) return;
    setBusy(true);
    try {
      await CommunityService.askAmaQuestion(sessionId, question.trim());
      setQuestion('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  const upvote = async (questionId: number) => {
    setBusy(true);
    try {
      await CommunityService.upvoteAmaQuestion(questionId);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const answer = async (questionId: number) => {
    const body = (answerDrafts[questionId] || '').trim();
    if (!body) return;
    setBusy(true);
    try {
      await CommunityService.answerAmaQuestion(questionId, body);
      setAnswerDrafts((drafts) => ({ ...drafts, [questionId]: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader
        title={session ? session.title : 'AMA'}
        subtitle={
          session ? `${t('ama_host', 'Host')}: ${session.host} · ${session.status}` : undefined
        }
      />
      <p>
        <Link href="/amas" style={{ color: palette.accent }}>
          ← {t('ama_back', 'All sessions')}
        </Link>
      </p>
      {error && (
        <p role="alert" style={{ color: palette.danger }}>
          {error}
        </p>
      )}
      {session && (
        <>
          <p data-testid="ama-description">{session.description}</p>
          {auth.isAuthenticated && session.status === 'LIVE' && (
            <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={t('ama_ask_placeholder', 'Ask your question…')}
                aria-label={t('ama_ask_placeholder', 'Ask your question…')}
                style={{ flex: 1, padding: 8 }}
                data-testid="ama-question-input"
              />
              <button
                type="button"
                onClick={ask}
                disabled={busy || !question.trim()}
                data-testid="ama-question-submit"
              >
                {t('ama_ask', 'Ask')}
              </button>
            </div>
          )}
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
            {session.questions.map((row) => (
              <li
                key={row.id}
                data-testid={`ama-question-${row.id}`}
                style={{
                  border: `1px solid ${palette.border}`,
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <strong>{row.author}</strong>
                  <button
                    type="button"
                    onClick={() => upvote(row.id)}
                    disabled={busy}
                    style={{ marginLeft: 'auto', fontSize: '0.85rem' }}
                    data-testid={`ama-upvote-${row.id}`}
                  >
                    ▲ {row.upvotes}
                  </button>
                </div>
                <p style={{ margin: '6px 0' }}>{row.question}</p>
                {row.answer ? (
                  <p
                    data-testid={`ama-answer-${row.id}`}
                    style={{
                      borderLeft: `3px solid ${palette.success}`,
                      paddingLeft: 10,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {row.answer}
                  </p>
                ) : auth.user?.username === session.host ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={answerDrafts[row.id] ?? ''}
                      onChange={(e) =>
                        setAnswerDrafts((drafts) => ({
                          ...drafts,
                          [row.id]: e.target.value,
                        }))
                      }
                      placeholder={t('ama_answer_placeholder', 'Write your answer…')}
                      aria-label={t('ama_answer_placeholder', 'Write your answer…')}
                      style={{ flex: 1, padding: 8 }}
                      data-testid={`ama-answer-input-${row.id}`}
                    />
                    <button
                      type="button"
                      onClick={() => answer(row.id)}
                      disabled={busy || !(answerDrafts[row.id] || '').trim()}
                      data-testid={`ama-answer-submit-${row.id}`}
                    >
                      {t('ama_answer', 'Answer')}
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
