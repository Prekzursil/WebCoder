'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { NotificationService } from '@/services/ApiService';
import { ApiNotification, NotificationVerb, cursorParamFromUrl } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { palette, hexAlpha } from '@/theme/tokens';
import EmptyState from '@/components/common/EmptyState';
import PageHeader from '@/components/common/PageHeader';

// Notifications wired to the real events endpoint (backend notifications
// app, PR #187): GET /api/v1/notifications/ is auth-scoped to the caller,
// newest-first cursor paginated, with ?unread=true, POST /{id}/mark-read/,
// POST /mark-all-read/ and GET /unread-count/. The backend verbs
// (SUBMISSION_JUDGED / THREAD_REPLY / PROBLEM_APPROVED / PROBLEM_REJECTED /
// SYSTEM) map onto the visual type chips below; titles/bodies are derived
// from verb + actor + the verb-specific `data` payload emitted by the
// backend (verdict, problem_id, submission_id, feedback, title, post_id).
// The old mock list, the fake "new notification after 8s" timer and the
// delete button (no DELETE endpoint exists) are gone.

type DisplayType = 'reply' | 'verdict' | 'approved' | 'rejected' | 'system';

const TYPE_META: Record<DisplayType, { icon: string; color: string; label: string }> = {
  reply: { icon: '💬', color: palette.accent, label: 'Reply' },
  verdict: { icon: '⚡', color: palette.warn, label: 'Verdict' },
  approved: { icon: '✓', color: palette.success, label: 'Approved' },
  rejected: { icon: '✕', color: palette.danger, label: 'Rejected' },
  system: { icon: '🔔', color: palette.muted, label: 'System' },
};

const VERB_TO_TYPE: Record<NotificationVerb, DisplayType> = {
  THREAD_REPLY: 'reply',
  SUBMISSION_JUDGED: 'verdict',
  PROBLEM_APPROVED: 'approved',
  PROBLEM_REJECTED: 'rejected',
  SYSTEM: 'system',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const str = (n: ApiNotification, key: string): string | undefined => {
  const value = n.data?.[key];
  return typeof value === 'string' ? value : undefined;
};
const num = (n: ApiNotification, key: string): number | undefined => {
  const value = n.data?.[key];
  return typeof value === 'number' ? value : undefined;
};

/** Derive the click target from the notification's generic target. */
function targetHref(n: ApiNotification): string | null {
  if (n.target_type === 'submission' && n.target_id !== null) return `/submissions/${n.target_id}`;
  if (n.target_type === 'thread' && n.target_id !== null) return `/forum/${n.target_id}`;
  if (n.target_type === 'problem' && (num(n, 'problem_id') ?? n.target_id) !== null) {
    return `/problems/${num(n, 'problem_id') ?? n.target_id}`;
  }
  return null;
}

/** Derive title/body from verb + data payload (backend emissions). */
function describe(n: ApiNotification): { title: string; body: string } {
  const who = n.actor ?? 'Someone';
  switch (n.verb) {
    case 'THREAD_REPLY': {
      const title = str(n, 'title');
      return {
        title: `${who} replied to your thread${title ? ` "${title}"` : ''}`,
        body: str(n, 'post_id') ? `Reply #${str(n, 'post_id')} in your thread.` : 'New reply in your thread.',
      };
    }
    case 'SUBMISSION_JUDGED': {
      const verdict = str(n, 'verdict') ?? 'judged';
      const problemId = num(n, 'problem_id');
      return {
        title: `Submission ${verdict}`,
        body: `Your submission${num(n, 'submission_id') ? ` #${num(n, 'submission_id')}` : ''}${
          problemId ? ` on problem #${problemId}` : ''
        } was judged ${verdict}.`,
      };
    }
    case 'PROBLEM_APPROVED':
      return {
        title: `${who} approved your problem`,
        body: str(n, 'feedback') ? `Feedback: ${str(n, 'feedback')}` : 'Your problem is now visible in the catalog.',
      };
    case 'PROBLEM_REJECTED':
      return {
        title: `${who} rejected your problem`,
        body: str(n, 'feedback') ? `Feedback: ${str(n, 'feedback')}` : 'Your problem was sent back as private.',
      };
    case 'SYSTEM':
    default:
      return { title: 'System notification', body: str(n, 'message') ?? '' };
  }
}

type FilterType = 'all' | DisplayType;

export default function NotificationsPage() {
  const auth = useAuth();
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (unreadOnly: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const response = await NotificationService.getNotifications({ unreadOnly, pageSize: 25 });
        setNotifications(response.results);
        setNextCursor(cursorParamFromUrl(response.next));
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : 'Failed to load notifications.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (auth.isAuthenticated) {
      load(showUnreadOnly);
    } else {
      setLoading(false);
      setNotifications([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.isAuthenticated, showUnreadOnly]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await NotificationService.getNotifications({
        cursor: nextCursor,
        unreadOnly: showUnreadOnly,
        pageSize: 25,
      });
      setNotifications((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...response.results.filter((n) => !seen.has(n.id))];
      });
      setNextCursor(cursorParamFromUrl(response.next));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to load more notifications.');
    } finally {
      setLoadingMore(false);
    }
  };

  const markRead = async (id: number) => {
    // Optimistic update; server value wins when the call resolves.
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    try {
      const updated = await NotificationService.markRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? updated : n)));
    } catch {
      // Optimistic state stays — mark-read is idempotent and retryable.
    }
  };

  const markAllRead = async () => {
    try {
      await NotificationService.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to mark all read.');
    }
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const filtered = notifications.filter((n) => filter === 'all' || VERB_TO_TYPE[n.verb] === filter);

  const filterTypes: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'reply', label: 'Replies' },
    { key: 'verdict', label: 'Verdicts' },
    { key: 'approved', label: 'Approvals' },
    { key: 'rejected', label: 'Rejections' },
    { key: 'system', label: 'System' },
  ];

  if (!auth.isAuthenticated) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <PageHeader title="Notifications" subtitle="Stay up to date with replies, verdicts, and community activity." />
        <EmptyState
          title="Log in to see your notifications."
          description="Replies to your threads, submission verdicts and problem approvals land here."
          icon="🔔"
          action={
            <Link href="/login" className="btn btn--primary">
              Log in
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <PageHeader title="Notifications" subtitle="Replies, verdicts, and community activity." />
          {unreadCount > 0 && (
            <span
              style={{
                background: palette.accent,
                color: palette.onAccent,
                fontSize: '0.7rem',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '999px',
                lineHeight: 1.4,
                marginBottom: '1.9rem',
                whiteSpace: 'nowrap',
              }}
            >
              {unreadCount} new
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', paddingBottom: '1.5rem' }}>
          <button
            onClick={() => setShowUnreadOnly((v) => !v)}
            aria-pressed={showUnreadOnly}
            className="chip"
            style={
              showUnreadOnly
                ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: hexAlpha(palette.accent, 0.12) }
                : undefined
            }
          >
            Unread only
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 600,
                background: hexAlpha(palette.success, 0.08),
                border: '1px solid rgba(74,222,128,0.2)',
                color: 'var(--success)',
                cursor: 'pointer',
              }}
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {filterTypes.map(({ key, label }) => {
          const count =
            key === 'all'
              ? unreadCount
              : notifications.filter((n) => VERB_TO_TYPE[n.verb] === key && !n.read_at).length;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              style={{
                padding: '5px 14px',
                borderRadius: '999px',
                fontSize: '0.78rem',
                fontWeight: 600,
                background: filter === key ? palette.accent : 'rgba(255,255,255,0.05)',
                border: `1px solid ${filter === key ? palette.accent : 'var(--border)'}`,
                color: filter === key ? palette.onAccent : 'var(--muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              {label}
              {count > 0 && (
                <span
                  style={{
                    background: filter === key ? 'rgba(0,0,0,0.2)' : palette.accent,
                    color: filter === key ? palette.onAccent : palette.onAccent,
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    padding: '1px 5px',
                    borderRadius: '999px',
                    lineHeight: 1.4,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* States */}
      {loading ? (
        <div role="status" style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
          Loading notifications…
        </div>
      ) : error && notifications.length === 0 ? (
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
          Could not load notifications: {error}
          <div style={{ marginTop: '0.75rem' }}>
            <button onClick={() => load(showUnreadOnly)} className="btn">
              Retry
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={showUnreadOnly ? 'No unread notifications.' : 'No notifications here.'}
          description="Replies to your threads and submission verdicts will show up here."
          icon="🎉"
        />
      ) : (
        <>
          {error && notifications.length > 0 && (
            <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
              {error}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {filtered.map((notif) => {
              const meta = TYPE_META[VERB_TO_TYPE[notif.verb]];
              const isRead = notif.read_at !== null;
              const { title, body } = describe(notif);
              const href = targetHref(notif);
              return (
                <div
                  key={notif.id}
                  style={{
                    background: isRead ? 'var(--surface)' : 'rgba(56,189,248,0.04)',
                    border: `1px solid ${isRead ? 'var(--border)' : 'rgba(56,189,248,0.18)'}`,
                    borderRadius: '10px',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    gap: '1rem',
                    alignItems: 'flex-start',
                    position: 'relative',
                  }}
                >
                  {/* Unread dot */}
                  {!isRead && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '14px',
                        left: '10px',
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: palette.accent,
                      }}
                    />
                  )}

                  {/* Type icon */}
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      flexShrink: 0,
                      background: `${meta.color}14`,
                      border: `1px solid ${meta.color}28`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1rem',
                      color: meta.color,
                      fontWeight: 800,
                      marginLeft: '8px',
                    }}
                  >
                    {meta.icon}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '0.25rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: meta.color,
                          background: `${meta.color}12`,
                          border: `1px solid ${meta.color}25`,
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {meta.label}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{timeAgo(notif.created_at)}</span>
                    </div>
                    {href ? (
                      <Link href={href} onClick={() => !isRead && markRead(notif.id)} style={{ textDecoration: 'none' }}>
                        <p
                          style={{
                            fontSize: '0.875rem',
                            fontWeight: isRead ? 500 : 700,
                            color: isRead ? 'var(--muted)' : 'var(--foreground)',
                            marginBottom: body ? '0.25rem' : 0,
                            lineHeight: 1.4,
                          }}
                        >
                          {title}
                        </p>
                      </Link>
                    ) : (
                      <p
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: isRead ? 500 : 700,
                          color: isRead ? 'var(--muted)' : 'var(--foreground)',
                          marginBottom: body ? '0.25rem' : 0,
                          lineHeight: 1.4,
                        }}
                      >
                        {title}
                      </p>
                    )}
                    {body && (
                      <p
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--muted)',
                          lineHeight: 1.5,
                          margin: 0,
                        }}
                      >
                        {body}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                    {!isRead && (
                      <button
                        onClick={() => markRead(notif.id)}
                        title="Mark as read"
                        style={{
                          background: 'rgba(56,189,248,0.08)',
                          border: '1px solid rgba(56,189,248,0.2)',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                          color: 'var(--accent)',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ✓ Read
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Paged loading */}
          {nextCursor && (
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button onClick={loadMore} disabled={loadingMore} className="btn">
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
