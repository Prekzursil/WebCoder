'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface Notification {
  id: number;
  type: 'reply' | 'upvote' | 'mention' | 'verdict' | 'contest' | 'system';
  title: string;
  body: string;
  href: string;
  isRead: boolean;
  createdAt: string;
  actor?: string;
  actorColor?: string;
}

const TYPE_META: Record<Notification['type'], { icon: string; color: string; label: string }> = {
  reply:   { icon: '💬', color: '#38bdf8', label: 'Reply' },
  upvote:  { icon: '▲',  color: '#4ade80', label: 'Upvote' },
  mention: { icon: '@',  color: '#a78bfa', label: 'Mention' },
  verdict: { icon: '⚡', color: '#fbbf24', label: 'Verdict' },
  contest: { icon: '🏆', color: '#fb923c', label: 'Contest' },
  system:  { icon: '🔔', color: '#64748b', label: 'System' },
};

const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: 1, type: 'verdict', isRead: false,
    title: 'Submission Accepted',
    body: 'Your solution for "Graph Shortest Path" was accepted — 100/100 points.',
    href: '/my-submissions',
    createdAt: new Date(Date.now() - 3 * 60000).toISOString(),
    actor: 'Judge',
    actorColor: '#fbbf24',
  },
  {
    id: 2, type: 'reply', isRead: false,
    title: 'mihai_dev replied to your thread',
    body: '"The issue is the list slicing arr[:mid] — each slice creates a new list, adding O(n) overhead…"',
    href: '/forum/3',
    createdAt: new Date(Date.now() - 18 * 60000).toISOString(),
    actor: 'mihai_dev',
    actorColor: '#38bdf8',
  },
  {
    id: 3, type: 'upvote', isRead: false,
    title: 'Your post received 5 upvotes',
    body: 'Your answer in "Why does my Python solution get TLE?" is trending.',
    href: '/forum/3',
    createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
    actor: 'Community',
    actorColor: '#4ade80',
  },
  {
    id: 4, type: 'mention', isRead: false,
    title: 'ioana_pro mentioned you',
    body: '"@radu_bits — Mihai is right about the slicing. Additionally, for Python specifically…"',
    href: '/forum/3',
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    actor: 'ioana_pro',
    actorColor: '#a78bfa',
  },
  {
    id: 5, type: 'contest', isRead: true,
    title: 'September 2026 Contest Results',
    body: 'You placed #14 in the September 2026 Monthly Contest. View the full standings.',
    href: '/forum/4',
    createdAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    actor: 'Contest System',
    actorColor: '#fb923c',
  },
  {
    id: 6, type: 'verdict', isRead: true,
    title: 'Submission: Wrong Answer',
    body: 'Your solution for "Binary Tree Traversal" failed on test case 4. Check the expected output.',
    href: '/my-submissions',
    createdAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    actor: 'Judge',
    actorColor: '#f87171',
  },
  {
    id: 7, type: 'reply', isRead: true,
    title: 'elena_cp replied to your thread',
    body: '"Great template! I have been using something similar but your lazy propagation approach is cleaner."',
    href: '/forum/5',
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    actor: 'elena_cp',
    actorColor: '#a78bfa',
  },
  {
    id: 8, type: 'system', isRead: true,
    title: 'Problem submission approved',
    body: 'Your problem "Fibonacci Modular" has been approved by the verification team.',
    href: '/my-created-problems',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    actor: 'System',
    actorColor: '#64748b',
  },
  {
    id: 9, type: 'upvote', isRead: true,
    title: 'Your thread received 12 upvotes',
    body: '"Segment Tree implementation — C++ template" is popular in the community.',
    href: '/forum/5',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    actor: 'Community',
    actorColor: '#4ade80',
  },
  {
    id: 10, type: 'contest', isRead: true,
    title: 'New contest starting in 24 hours',
    body: 'October 2026 Monthly Contest begins tomorrow at 18:00 UTC. Register now.',
    href: '/forum',
    createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    actor: 'Contest System',
    actorColor: '#fb923c',
  },
];

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

type FilterType = 'all' | Notification['type'];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  const [filter, setFilter] = useState<FilterType>('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  // Simulate a new notification arriving after 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setNotifications(prev => [
        {
          id: Date.now(),
          type: 'reply',
          isRead: false,
          title: 'stefan_algo replied to your post',
          body: '"Matrix exponentiation is indeed powerful — have you tried applying it to Fibonacci sequences?"',
          href: '/forum/10',
          createdAt: new Date().toISOString(),
          actor: 'stefan_algo',
          actorColor: '#a78bfa',
        },
        ...prev,
      ]);
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  const markAllRead = () => setNotifications(n => n.map(x => ({ ...x, isRead: true })));
  const markRead = (id: number) => setNotifications(n => n.map(x => x.id === id ? { ...x, isRead: true } : x));
  const deleteNotif = (id: number) => setNotifications(n => n.filter(x => x.id !== id));

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const filtered = notifications.filter(n => {
    if (showUnreadOnly && n.isRead) return false;
    if (filter !== 'all' && n.type !== filter) return false;
    return true;
  });

  const filterTypes: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'reply', label: 'Replies' },
    { key: 'upvote', label: 'Upvotes' },
    { key: 'mention', label: 'Mentions' },
    { key: 'verdict', label: 'Verdicts' },
    { key: 'contest', label: 'Contests' },
    { key: 'system', label: 'System' },
  ];

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.4rem' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem',
            }}>🔔</div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#f1f5f9' }}>
              Notifications
            </h1>
            {unreadCount > 0 && (
              <span style={{
                background: '#38bdf8', color: '#0f172a',
                fontSize: '0.7rem', fontWeight: 800,
                padding: '2px 8px', borderRadius: '999px',
                lineHeight: 1.4,
              }}>{unreadCount} new</span>
            )}
          </div>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Stay up to date with replies, verdicts, and community activity.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setShowUnreadOnly(v => !v)}
            style={{
              padding: '7px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600,
              background: showUnreadOnly ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${showUnreadOnly ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`,
              color: showUnreadOnly ? '#38bdf8' : '#94a3b8',
              cursor: 'pointer', transition: 'all 150ms ease',
            }}
          >
            Unread only
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              style={{
                padding: '7px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600,
                background: 'rgba(74,222,128,0.08)',
                border: '1px solid rgba(74,222,128,0.2)',
                color: '#4ade80',
                cursor: 'pointer', transition: 'all 150ms ease',
              }}
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Filter pills */}
      <div style={{
        display: 'flex', gap: '6px', flexWrap: 'wrap',
        marginBottom: '1.25rem',
      }}>
        {filterTypes.map(({ key, label }) => {
          const count = key === 'all'
            ? notifications.filter(n => !n.isRead).length
            : notifications.filter(n => n.type === key && !n.isRead).length;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                padding: '5px 14px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 600,
                background: filter === key ? '#38bdf8' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${filter === key ? '#38bdf8' : 'rgba(255,255,255,0.08)'}`,
                color: filter === key ? '#0f172a' : '#94a3b8',
                cursor: 'pointer', transition: 'all 150ms ease',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              {label}
              {count > 0 && (
                <span style={{
                  background: filter === key ? 'rgba(0,0,0,0.2)' : '#38bdf8',
                  color: filter === key ? '#0f172a' : '#0f172a',
                  fontSize: '0.65rem', fontWeight: 800,
                  padding: '1px 5px', borderRadius: '999px',
                  lineHeight: 1.4,
                }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Notification list */}
      {filtered.length === 0 ? (
        <div style={{
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '12px', padding: '3rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🎉</div>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
            {showUnreadOnly ? 'No unread notifications.' : 'No notifications here.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {filtered.map(notif => {
            const meta = TYPE_META[notif.type];
            return (
              <div
                key={notif.id}
                style={{
                  background: notif.isRead ? '#1e293b' : 'rgba(56,189,248,0.04)',
                  border: `1px solid ${notif.isRead ? 'rgba(255,255,255,0.06)' : 'rgba(56,189,248,0.18)'}`,
                  borderRadius: '10px',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-start',
                  transition: 'all 150ms ease',
                  position: 'relative',
                }}
              >
                {/* Unread dot */}
                {!notif.isRead && (
                  <div style={{
                    position: 'absolute', top: '14px', left: '10px',
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: '#38bdf8',
                  }} />
                )}

                {/* Type icon */}
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
                  background: `${meta.color}14`,
                  border: `1px solid ${meta.color}28`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: notif.type === 'upvote' ? '0.75rem' : '1rem',
                  color: meta.color, fontWeight: 800,
                  marginLeft: '8px',
                }}>
                  {meta.icon}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: meta.color, background: `${meta.color}12`,
                      border: `1px solid ${meta.color}25`,
                      padding: '1px 6px', borderRadius: '4px',
                    }}>{meta.label}</span>
                    <span style={{ fontSize: '0.72rem', color: '#475569' }}>{timeAgo(notif.createdAt)}</span>
                  </div>
                  <Link href={notif.href} onClick={() => markRead(notif.id)} style={{ textDecoration: 'none' }}>
                    <p style={{
                      fontSize: '0.875rem', fontWeight: notif.isRead ? 500 : 700,
                      color: notif.isRead ? '#94a3b8' : '#f1f5f9',
                      marginBottom: '0.25rem', lineHeight: 1.4,
                    }}>{notif.title}</p>
                  </Link>
                  <p style={{
                    fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5,
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                  }}>{notif.body}</p>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                  {!notif.isRead && (
                    <button
                      onClick={() => markRead(notif.id)}
                      title="Mark as read"
                      style={{
                        background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)',
                        borderRadius: '6px', padding: '4px 8px', cursor: 'pointer',
                        color: '#38bdf8', fontSize: '0.7rem', fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >✓ Read</button>
                  )}
                  <button
                    onClick={() => deleteNotif(notif.id)}
                    title="Dismiss"
                    style={{
                      background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)',
                      borderRadius: '6px', padding: '4px 8px', cursor: 'pointer',
                      color: '#f87171', fontSize: '0.7rem', fontWeight: 600,
                    }}
                  >✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
