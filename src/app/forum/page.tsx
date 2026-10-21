'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ForumService } from '@/services/ApiService';
import { ForumThread } from '@/types/api';
import { palette, hexAlpha } from '@/theme/tokens';
import EmptyState from '@/components/common/EmptyState';
import PageHeader from '@/components/common/PageHeader';

// Forum index wired to the real threads endpoint (backend forum app, PR
// #188): GET /api/v1/forum/threads/ is public, page-number paginated (20
// rows/page) and ordered pinned-then-last-activity server-side. The mock
// CATEGORIES / THREADS arrays (fake counts, fake excerpt/view columns) are
// gone — the backend has no categories: a thread either links a problem or
// is global, so the category grid collapses into an honest All /
// Problem-linked / General filter. Search/sort stay client-side over the
// loaded rows; "Load more" follows the envelope's `next` link.

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

type CategoryFilter = 'all' | 'problem' | 'general';
type SortBy = 'activity' | 'newest';

export default function ForumPage() {
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(1);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('activity');

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await ForumService.getThreads({ page: 1 });
      setThreads(response.results);
      setTotalCount(response.count);
      setNextPage(response.next ? 2 : null);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to load threads.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = async () => {
    if (nextPage === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await ForumService.getThreads({ page: nextPage });
      setThreads((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...response.results.filter((t) => !seen.has(t.id))];
      });
      setNextPage(response.next ? nextPage + 1 : null);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to load more threads.');
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = threads
    .filter((t) => {
      if (activeCategory === 'problem' && !t.problem) return false;
      if (activeCategory === 'general' && t.problem) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          (t.author ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      // Server default is pinned-then-last_activity; "newest" re-sorts the
      // loaded rows by creation date (pinned still float up).
      if (sortBy === 'newest') {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return 0;
    });

  const categoryChips: { key: CategoryFilter; label: string; icon: string }[] = [
    { key: 'all', label: 'All', icon: '🌐' },
    { key: 'problem', label: 'Problem threads', icon: '🧩' },
    { key: 'general', label: 'General', icon: '💬' },
  ];

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <PageHeader title="Community Forum" subtitle="Discuss problems, share solutions, and connect with the community." />

      {/* Toolbar */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '0.875rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {categoryChips.map(({ key, label, icon }) => {
          const active = activeCategory === key;
          return (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              aria-pressed={active}
              className="chip"
              style={
                active
                  ? {
                      borderColor: 'var(--accent)',
                      color: 'var(--accent)',
                      background: hexAlpha(palette.accent, 0.12),
                    }
                  : undefined
              }
            >
              {icon} {label}
            </button>
          );
        })}
        <input
          type="text"
          placeholder="Search threads…"
          aria-label="Search threads"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: '1 1 200px',
            minWidth: '160px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--foreground)',
            padding: '7px 12px',
            fontSize: '0.875rem',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '3px' }}>
          {(['activity', 'newest'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              aria-pressed={sortBy === s}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 120ms ease',
                background: sortBy === s ? palette.accent : 'transparent',
                color: sortBy === s ? palette.onAccent : 'var(--muted)',
                textTransform: 'capitalize',
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <Link
          href="/forum/new"
          className="btn btn--primary"
          style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
        >
          + New Thread
        </Link>
      </div>

      {/* States */}
      {loading ? (
        <div role="status" style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
          Loading threads…
        </div>
      ) : error && threads.length === 0 ? (
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
          Could not load threads: {error}
          <div style={{ marginTop: '0.75rem' }}>
            <button onClick={loadFirstPage} className="btn">
              Retry
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={threads.length === 0 ? 'No threads yet.' : 'No threads match your filters.'}
          description="Start the conversation — create the first thread."
          action={
            threads.length === 0 ? (
              <Link href="/forum/new" className="btn btn--primary">
                + New Thread
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {filtered.map((thread) => (
              <div
                key={thread.id}
                style={{
                  background: 'var(--surface)',
                  border: `1px solid ${thread.is_pinned ? 'rgba(56,189,248,0.2)' : 'var(--border)'}`,
                  borderRadius: '10px',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-start',
                  transition: 'border-color 150ms ease',
                }}
              >
                {/* Main content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                    {thread.is_pinned && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          color: 'var(--accent)',
                          background: 'rgba(56,189,248,0.1)',
                          border: '1px solid rgba(56,189,248,0.2)',
                          padding: '1px 7px',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        📌 Pinned
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
                          padding: '1px 7px',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        🔒 Locked
                      </span>
                    )}
                    {thread.problem ? (
                      <Link
                        href={`/problems/${thread.problem.id}`}
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          padding: '1px 7px',
                          borderRadius: '4px',
                          color: palette.violet,
                          background: hexAlpha(palette.violet, 0.07),
                          border: `1px solid ${hexAlpha(palette.violet, 0.15)}`,
                          textDecoration: 'none',
                        }}
                      >
                        🧩 {thread.problem.title_i18n?.en ?? `Problem #${thread.problem.id}`}
                      </Link>
                    ) : (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          padding: '1px 7px',
                          borderRadius: '4px',
                          color: 'var(--muted)',
                          background: 'rgba(100,116,139,0.1)',
                          border: '1px solid rgba(100,116,139,0.15)',
                        }}
                      >
                        💬 General
                      </span>
                    )}
                  </div>

                  <Link href={`/forum/${thread.id}`} style={{ textDecoration: 'none' }}>
                    <h3
                      style={{
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        color: 'var(--foreground)',
                        marginBottom: '0.35rem',
                        lineHeight: 1.4,
                      }}
                    >
                      {thread.title}
                    </h3>
                  </Link>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          background: `hsl(${((thread.author ?? 'a').charCodeAt(0) * 37) % 360}, 55%, 35%)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.6rem',
                          fontWeight: 700,
                          color: '#fff',
                        }}
                      >
                        {(thread.author ?? '?')[0].toUpperCase()}
                      </div>
                      <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 500 }}>
                        {thread.author ?? 'unknown'}
                      </span>
                    </div>
                    <span style={{ color: 'var(--border)', fontSize: '0.75rem' }}>·</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      Active {timeAgo(thread.last_activity)}
                    </span>
                  </div>
                </div>

                {/* Right: stats */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: '6px',
                    minWidth: '80px',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'right' }}>
                    <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{thread.post_count}</span> posts
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textAlign: 'right' }}>
                    created {timeAgo(thread.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Paged loading */}
          {nextPage !== null && (
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button onClick={loadMore} disabled={loadingMore} className="btn">
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
          {error && threads.length > 0 && (
            <p role="alert" style={{ marginTop: '0.75rem', color: 'var(--danger)', fontSize: '0.8rem', textAlign: 'center' }}>
              Could not load more threads: {error}
            </p>
          )}
          {totalCount !== null && (
            <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
              Showing {threads.length} of {totalCount.toLocaleString()} threads.
            </p>
          )}
        </>
      )}
    </div>
  );
}
