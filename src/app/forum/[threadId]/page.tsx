'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ForumService } from '@/services/ApiService';
import { ForumPost, ForumThread, cursorParamFromUrl } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { palette, hexAlpha } from '@/theme/tokens';

// Thread detail wired to the real endpoints (backend forum app, PR #188):
// - GET /forum/threads/{id}/ (public) + GET /forum/threads/{id}/posts/
//   (public, oldest-first cursor pagination — new replies never shift pages).
// - Reply: POST /forum/threads/{id}/posts/ (auth; 400 when locked/hidden).
// - Votes: POST /forum/posts/{id}/vote/ {value: 1|-1|0} (auth) → {upvotes}.
// - Report: POST /forum/reports/ {post, reason, details?} (auth; 409 on dup).
// The old mock THREAD_DATA / FALLBACK_THREAD / fake view counts / fake role
// chips are gone — an unknown or deleted thread now renders a proper
// not-found state with a link back to the forum index.

// [Q2] relative-time formatter localized through the injected translator.
function timeAgo(dateStr: string, t: ReturnType<typeof useTranslation>['t']): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return t('time_min_ago', '{{count}}m ago', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('time_hour_ago', '{{count}}h ago', { count: hrs });
  const days = Math.floor(hrs / 24);
  return t('time_day_ago', '{{count}}d ago', { count: days });
}

const REPORT_REASONS = ['spam', 'abuse', 'off_topic', 'inappropriate', 'other'] as const;

export default function ForumThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const { t } = useTranslation();
  const auth = useAuth();

  const [thread, setThread] = useState<ForumThread | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [replyText, setReplyText] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [votes, setVotes] = useState<Record<number, number>>({});
  const [voteBusy, setVoteBusy] = useState<number | null>(null);
  const [reporting, setReporting] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState<string>(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState('');
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const loadThread = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const [threadData, firstPosts] = await Promise.all([
        ForumService.getThread(threadId),
        ForumService.getPosts(threadId, { pageSize: 25 }),
      ]);
      setThread(threadData);
      setPosts(firstPosts.results);
      setNextCursor(cursorParamFromUrl(firstPosts.next));
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t('forum_thread_load_error', 'Failed to load thread.');
      // apiFetch throws Error(detail || statusText); a missing thread is a
      // 404 detail ("Not found.") — treat any 404-shaped message as not-found.
      if (/not found|404/i.test(message)) {
        setNotFound(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
    // t is stable between language switches; listed so the error message
    // re-localizes on locale change.
  }, [threadId, t]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  const loadMorePosts = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await ForumService.getPosts(threadId, { cursor: nextCursor, pageSize: 25 });
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...response.results.filter((p) => !seen.has(p.id))];
      });
      setNextCursor(cursorParamFromUrl(response.next));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('forum_posts_load_error', 'Failed to load more posts.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);
    setReplyError(null);
    try {
      const post = await ForumService.createPost(threadId, { content: replyText.trim() });
      setPosts((prev) => [...prev, post]);
      setReplyText('');
      setThread((t) => (t ? { ...t, post_count: t.post_count + 1 } : t));
    } catch (err) {
      setReplyError(err instanceof Error && err.message ? err.message : t('forum_reply_error', 'Failed to post reply.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (postId: number, value: 1 | -1) => {
    if (!auth.isAuthenticated) {
      setVoteBusy(null);
      return;
    }
    // Clicking the same arrow again removes the vote (value 0).
    const current = votes[postId] ?? 0;
    const next = current === value ? 0 : value;
    setVoteBusy(postId);
    try {
      const { upvotes } = await ForumService.votePost(postId, next as 1 | -1 | 0);
      setVotes((v) => ({ ...v, [postId]: next }));
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, upvotes } : p)));
    } catch {
      // Best-effort: score stays at the server's last value.
    } finally {
      setVoteBusy(null);
    }
  };

  const submitReport = async (postId: number) => {
    setReportError(null);
    setReportMessage(null);
    try {
      await ForumService.reportPost(postId, { reason: reportReason, details: reportDetails.trim() || undefined });
      setReportMessage(t('forum_report_success', 'Report submitted. A moderator will review it.'));
      setReporting(null);
      setReportDetails('');
    } catch (err) {
      setReportError(err instanceof Error && err.message ? err.message : t('forum_report_error', 'Failed to report post.'));
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div role="status" style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
          {t('forum_thread_loading', 'Loading thread…')}
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            color: 'var(--muted)',
            background: 'var(--surface)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔍</div>
          <p style={{ marginBottom: '1rem' }}>{t('forum_thread_not_found', 'This thread does not exist or was removed.')}</p>
          <Link href="/forum" className="btn">
            {t('forum_back_to_forum', '← Back to Forum')}
          </Link>
        </div>
      </div>
    );
  }

  if (error && !thread) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div
          role="alert"
          style={{
            padding: '1.25rem 1.5rem',
            borderRadius: 'var(--radius-md)',
            background: hexAlpha(palette.danger, 0.08),
            border: `1px solid ${hexAlpha(palette.danger, 0.2)}`,
            color: 'var(--danger)',
          }}
        >
          {t('could_not_load_thread', 'Could not load thread: ')}{error}
        </div>
        <div style={{ marginTop: '0.75rem' }}>
          <button onClick={loadThread} className="btn">
            {t('retry_button', 'Retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!thread) return null;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
        <Link href="/forum" style={{ color: 'var(--accent)' }}>
          Forum
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--muted)' }}>{thread.problem ? t('forum_filter_problem', 'Problem threads') : t('forum_filter_general', 'General')}</span>
        <span>›</span>
        <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
          {thread.title}
        </span>
      </div>

      {/* Thread header */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          {thread.is_pinned && (
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                color: 'var(--accent)',
                background: 'rgba(56,189,248,0.1)',
                border: '1px solid rgba(56,189,248,0.2)',
                padding: '2px 8px',
                borderRadius: '4px',
                textTransform: 'uppercase',
              }}
            >
              {t('forum_pinned', '📌 Pinned')}
            </span>
          )}
          {thread.is_locked && (
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                color: 'var(--muted)',
                background: 'rgba(100,116,139,0.1)',
                border: '1px solid rgba(100,116,139,0.2)',
                padding: '2px 8px',
                borderRadius: '4px',
                textTransform: 'uppercase',
              }}
            >
              {t('forum_locked', '🔒 Locked')}
            </span>
          )}
          {thread.problem ? (
            <Link
              href={`/problems/${thread.problem.id}`}
              style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                color: palette.violet,
                background: hexAlpha(palette.violet, 0.07),
                border: `1px solid ${hexAlpha(palette.violet, 0.15)}`,
                padding: '2px 8px',
                borderRadius: '4px',
                textDecoration: 'none',
              }}
            >
              🧩 {thread.problem.title_i18n?.en ?? t('forum_problem_link', 'Problem #{{id}}', { id: thread.problem.id })}
            </Link>
          ) : (
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                color: 'var(--muted)',
                background: 'rgba(100,116,139,0.1)',
                border: '1px solid rgba(100,116,139,0.15)',
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              {t('forum_general_chip', '💬 General')}
            </span>
          )}
        </div>
        <h1
          style={{
            fontSize: '1.4rem',
            fontWeight: 800,
            color: 'var(--foreground)',
            letterSpacing: '-0.02em',
            marginBottom: '0.75rem',
            lineHeight: 1.3,
          }}
        >
          {thread.title}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
            {t('forum_started_by', 'started by')} <strong style={{ color: 'var(--muted)' }}>{thread.author ?? t('forum_unknown_author', 'unknown')}</strong>{' '}
            {timeAgo(thread.created_at, t)}
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{t('forum_posts_count', '{{count}} posts', { count: thread.post_count })}</span>
        </div>
      </div>

      {/* Posts */}
      {reportMessage && (
        <p role="status" style={{ color: 'var(--success)', fontSize: '0.8rem', marginBottom: '1rem' }}>
          {reportMessage}
        </p>
      )}
      {reportError && (
        <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '1rem' }}>
          {reportError}
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '1rem' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
        {posts.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem' }}>{t('forum_no_posts', 'No posts yet.')}</p>}
        {posts.map((post, idx) => {
          const myVote = votes[post.id] ?? 0;
          return (
            <div
              key={post.id}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', gap: '1rem', padding: '1.25rem 1.5rem' }}>
                {/* Vote column */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '40px' }}>
                  <button
                    onClick={() => handleVote(post.id, 1)}
                    disabled={!auth.isAuthenticated || voteBusy === post.id}
                    aria-label={t('forum_upvote_label', 'Upvote post')}
                    title={auth.isAuthenticated ? t('forum_upvote', 'Upvote') : t('forum_login_to_vote', 'Login to vote')}
                    style={{
                      background: myVote === 1 ? 'rgba(56,189,248,0.18)' : 'rgba(56,189,248,0.08)',
                      border: '1px solid rgba(56,189,248,0.2)',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      cursor: auth.isAuthenticated ? 'pointer' : 'not-allowed',
                      color: 'var(--accent)',
                      fontSize: '0.75rem',
                    }}
                  >
                    ▲
                  </button>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--muted)' }}>{post.upvotes}</span>
                  <button
                    onClick={() => handleVote(post.id, -1)}
                    disabled={!auth.isAuthenticated || voteBusy === post.id}
                    aria-label={t('forum_downvote_label', 'Downvote post')}
                    title={auth.isAuthenticated ? t('forum_downvote', 'Downvote') : t('forum_login_to_vote', 'Login to vote')}
                    style={{
                      background: myVote === -1 ? 'rgba(248,113,113,0.18)' : 'rgba(248,113,113,0.08)',
                      border: '1px solid rgba(248,113,113,0.2)',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      cursor: auth.isAuthenticated ? 'pointer' : 'not-allowed',
                      color: 'var(--danger)',
                      fontSize: '0.75rem',
                    }}
                  >
                    ▼
                  </button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: `hsl(${((post.author ?? 'a').charCodeAt(0) * 37) % 360}, 55%, 35%)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#fff',
                        flexShrink: 0,
                      }}
                    >
                      {(post.author ?? '?')[0].toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 700, color: 'var(--foreground)', fontSize: '0.875rem' }}>
                      {post.author ?? t('forum_unknown_author', 'unknown')}
                    </span>
                    {idx === 0 && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          color: 'var(--accent)',
                          background: 'rgba(56,189,248,0.1)',
                          padding: '1px 7px',
                          borderRadius: '4px',
                        }}
                      >
                        OP
                      </span>
                    )}
                    {post.is_edited && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{t('forum_edited', '(edited)')}</span>
                    )}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                      {idx === 0 ? t('forum_posted', 'Posted') : t('forum_replied', 'Replied')} {timeAgo(post.created_at, t)}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.875rem', color: 'var(--body)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {post.content}
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', alignItems: 'center' }}>
                    {auth.isAuthenticated && (
                      <button
                        onClick={() => setReporting(reporting === post.id ? null : post.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          color: 'var(--text-tertiary)',
                          padding: '4px 0',
                        }}
                      >
                        {t('forum_report', '⚑ Report')}
                      </button>
                    )}
                    {reporting === post.id && (
                      <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                          aria-label={t('forum_report_reason_label', 'Report reason')}
                          value={reportReason}
                          onChange={(e) => setReportReason(e.target.value)}
                          style={{
                            background: 'var(--surface)',
                            color: 'var(--foreground)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            padding: '3px 6px',
                            fontSize: '0.75rem',
                          }}
                        >
                          {REPORT_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {t(`report_reason_${r}`, r)}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label={t('forum_report_details_label', 'Report details')}
                          placeholder={t('forum_report_details_placeholder', 'details (optional)')}
                          value={reportDetails}
                          onChange={(e) => setReportDetails(e.target.value)}
                          style={{
                            background: 'var(--surface)',
                            color: 'var(--foreground)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            padding: '3px 8px',
                            fontSize: '0.75rem',
                            width: '180px',
                          }}
                        />
                        <button onClick={() => submitReport(post.id)} className="btn" style={{ padding: '3px 10px', fontSize: '0.75rem' }}>
                          {t('forum_send', 'Send')}
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Older posts pager (cursor) */}
      {nextCursor && (
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <button onClick={loadMorePosts} disabled={loadingMore} className="btn">
            {loadingMore ? t('loading_more', 'Loading…') : t('forum_load_older', 'Load older posts')}
          </button>
        </div>
      )}

      {/* Reply box */}
      {!thread.is_locked ? (
        auth.isAuthenticated ? (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1.5rem',
            }}
          >
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: '1rem' }}>
              {t('forum_post_reply_header', 'Post a Reply')}
            </h3>
            <form onSubmit={handleReply}>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={t('forum_reply_placeholder', 'Write your reply…')}
                rows={6}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--foreground)',
                  padding: '12px',
                  fontSize: '0.875rem',
                  resize: 'vertical',
                  outline: 'none',
                  lineHeight: 1.6,
                }}
              />
              {replyError && (
                <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                  {replyError}
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setReplyText('')}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid var(--border)',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  {t('forum_clear', 'Clear')}
                </button>
                <button
                  type="submit"
                  disabled={!replyText.trim() || submitting}
                  className="btn btn--primary"
                  style={{ opacity: replyText.trim() && !submitting ? 1 : 0.5 }}
                >
                  {submitting ? t('forum_posting', 'Posting…') : t('forum_post_reply', 'Post Reply')}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div
            style={{
              padding: '1.25rem',
              background: 'rgba(100,116,139,0.08)',
              border: '1px solid rgba(100,116,139,0.2)',
              borderRadius: '10px',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: '0.875rem',
            }}
          >
            <Link href="/login" style={{ color: 'var(--accent)' }}>
              {t('log_in_button', 'Log in')}
            </Link>{' '}
            {t('forum_login_to_join_suffix', 'to join the discussion.')}
          </div>
        )
      ) : (
        <div
          style={{
            padding: '1.25rem',
            background: 'rgba(100,116,139,0.08)',
            border: '1px solid rgba(100,116,139,0.2)',
            borderRadius: '10px',
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: '0.875rem',
          }}
        >
          {t('forum_thread_locked_notice', '🔒 This thread is locked. No new replies can be posted.')}
        </div>
      )}
    </div>
  );
}
