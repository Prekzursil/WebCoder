'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

interface ForumCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
  threadCount: number;
  postCount: number;
}

interface ForumThread {
  id: number;
  title: string;
  categoryId: string;
  author: string;
  authorColor: string;
  createdAt: string;
  lastActivity: string;
  replyCount: number;
  viewCount: number;
  upvotes: number;
  isPinned: boolean;
  isLocked: boolean;
  isSolved: boolean;
  tags: string[];
  excerpt: string;
}

const CATEGORIES: ForumCategory[] = [
  { id: 'general', name: 'General Discussion', icon: '💬', description: 'Off-topic chat, introductions, and community news.', color: '#38bdf8', threadCount: 142, postCount: 1840 },
  { id: 'help', name: 'Help & Support', icon: '🙋', description: 'Stuck on a problem? Ask for hints or explanations.', color: '#4ade80', threadCount: 318, postCount: 2950 },
  { id: 'editorial', name: 'Editorials', icon: '📝', description: 'Official and community-written problem editorials.', color: '#fbbf24', threadCount: 89, postCount: 740 },
  { id: 'contest', name: 'Contests', icon: '🏆', description: 'Announcements, results, and post-contest discussions.', color: '#a78bfa', threadCount: 54, postCount: 620 },
  { id: 'bugs', name: 'Bug Reports', icon: '🐛', description: 'Report platform issues and track their resolution.', color: '#f87171', threadCount: 27, postCount: 190 },
  { id: 'feature', name: 'Feature Requests', icon: '✨', description: 'Suggest improvements to the platform.', color: '#fb923c', threadCount: 61, postCount: 430 },
];

const THREADS: ForumThread[] = [
  { id: 1, title: 'Welcome to the WebCoder Community Forum!', categoryId: 'general', author: 'admin', authorColor: '#f87171', createdAt: '2026-09-01T10:00:00Z', lastActivity: '2026-09-28T18:00:00Z', replyCount: 42, viewCount: 1820, upvotes: 98, isPinned: true, isLocked: false, isSolved: false, tags: ['announcement', 'welcome'], excerpt: 'Welcome to the official WebCoder forum. This is the place to discuss problems, share solutions, and connect with fellow competitive programmers.' },
  { id: 2, title: '[Editorial] Graph Shortest Path — Dijkstra approach explained', categoryId: 'editorial', author: 'mihai_dev', authorColor: '#38bdf8', createdAt: '2026-09-25T14:00:00Z', lastActivity: '2026-09-28T20:15:00Z', replyCount: 18, viewCount: 540, upvotes: 67, isPinned: true, isLocked: false, isSolved: false, tags: ['dijkstra', 'graphs', 'editorial'], excerpt: 'In this editorial I walk through the optimal Dijkstra-based solution for Problem #7, including complexity analysis and common pitfalls.' },
  { id: 3, title: 'Why does my Python solution get TLE on test case 12?', categoryId: 'help', author: 'radu_bits', authorColor: '#4ade80', createdAt: '2026-09-28T09:30:00Z', lastActivity: '2026-09-28T22:00:00Z', replyCount: 7, viewCount: 210, upvotes: 12, isPinned: false, isLocked: false, isSolved: true, tags: ['python', 'tle', 'optimization'], excerpt: 'I have a working solution for Merge Sort (Problem #5) but it times out on the last few test cases. My current approach is O(n log n) but...' },
  { id: 4, title: 'September 2026 Monthly Contest — Results & Discussion', categoryId: 'contest', author: 'admin', authorColor: '#f87171', createdAt: '2026-09-27T20:00:00Z', lastActivity: '2026-09-28T21:30:00Z', replyCount: 31, viewCount: 890, upvotes: 54, isPinned: false, isLocked: false, isSolved: false, tags: ['contest', 'results', 'september'], excerpt: 'The September 2026 Monthly Contest has concluded! Congratulations to alex_coder for taking first place with a perfect score. Full standings below.' },
  { id: 5, title: 'Segment Tree implementation — C++ template I use for every contest', categoryId: 'general', author: 'elena_cp', authorColor: '#a78bfa', createdAt: '2026-09-24T16:00:00Z', lastActivity: '2026-09-27T14:00:00Z', replyCount: 24, viewCount: 670, upvotes: 89, isPinned: false, isLocked: false, isSolved: false, tags: ['c++', 'segment-tree', 'template'], excerpt: 'After years of competitive programming I have settled on this segment tree template. It handles range queries, lazy propagation, and is easy to adapt.' },
  { id: 6, title: 'Bug: Submission verdict stuck on PENDING for over 10 minutes', categoryId: 'bugs', author: 'bogdan_dev', authorColor: '#fbbf24', createdAt: '2026-09-26T11:00:00Z', lastActivity: '2026-09-27T09:00:00Z', replyCount: 5, viewCount: 180, upvotes: 8, isPinned: false, isLocked: true, isSolved: true, tags: ['bug', 'judge', 'pending'], excerpt: 'My submission #1031 has been stuck in PENDING state for over 10 minutes. The judge seems to be unresponsive for C++ submissions.' },
  { id: 7, title: 'Feature request: Dark/light theme toggle', categoryId: 'feature', author: 'laura_algo', authorColor: '#fb923c', createdAt: '2026-09-22T13:00:00Z', lastActivity: '2026-09-26T17:00:00Z', replyCount: 15, viewCount: 320, upvotes: 41, isPinned: false, isLocked: false, isSolved: false, tags: ['ui', 'theme', 'feature'], excerpt: 'Would love to have a light theme option for daytime coding sessions. The current dark theme is great but a toggle would be appreciated.' },
  { id: 8, title: 'How to approach Dynamic Programming problems as a beginner?', categoryId: 'help', author: 'andrei_cp', authorColor: '#4ade80', createdAt: '2026-09-20T08:00:00Z', lastActivity: '2026-09-25T19:00:00Z', replyCount: 22, viewCount: 780, upvotes: 76, isPinned: false, isLocked: false, isSolved: true, tags: ['dp', 'beginner', 'learning'], excerpt: 'I am fairly new to competitive programming and DP problems are really intimidating. What resources and problem-solving strategies do you recommend?' },
  { id: 9, title: '[Editorial] Binary Tree Traversal — all four methods compared', categoryId: 'editorial', author: 'ioana_pro', authorColor: '#38bdf8', createdAt: '2026-09-18T15:00:00Z', lastActivity: '2026-09-24T11:00:00Z', replyCount: 11, viewCount: 430, upvotes: 55, isPinned: false, isLocked: false, isSolved: false, tags: ['trees', 'traversal', 'editorial'], excerpt: 'This editorial covers all four traversal methods (pre-order, in-order, post-order, level-order) for Problem #3 with code examples in Python and C++.' },
  { id: 10, title: 'Matrix Exponentiation — when and how to use it', categoryId: 'general', author: 'stefan_algo', authorColor: '#a78bfa', createdAt: '2026-09-15T12:00:00Z', lastActivity: '2026-09-23T16:00:00Z', replyCount: 19, viewCount: 560, upvotes: 72, isPinned: false, isLocked: false, isSolved: false, tags: ['matrix', 'exponentiation', 'advanced'], excerpt: 'Matrix exponentiation is a powerful technique for solving linear recurrences in O(k³ log n) time. Here is a comprehensive guide with examples.' },
];

const tagColors: Record<string, string> = {
  announcement: '#f87171', welcome: '#4ade80', dijkstra: '#38bdf8', graphs: '#38bdf8',
  editorial: '#fbbf24', python: '#3b82f6', tle: '#fbbf24', optimization: '#fb923c',
  contest: '#a78bfa', results: '#a78bfa', 'c++': '#a78bfa', 'segment-tree': '#a78bfa',
  template: '#94a3b8', bug: '#f87171', judge: '#f87171', pending: '#fbbf24',
  ui: '#38bdf8', theme: '#38bdf8', feature: '#fb923c', dp: '#4ade80',
  beginner: '#4ade80', learning: '#4ade80', trees: '#fbbf24', traversal: '#fbbf24',
  matrix: '#a78bfa', exponentiation: '#a78bfa', advanced: '#f87171',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ForumPage() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'activity' | 'newest' | 'top'>('activity');

  const filtered = useMemo(() => {
    let list = THREADS;
    if (activeCategory !== 'all') list = list.filter(t => t.categoryId === activeCategory);
    if (search) list = list.filter(t =>
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.excerpt.toLowerCase().includes(search.toLowerCase()) ||
      t.tags.some(tag => tag.includes(search.toLowerCase()))
    );
    const pinned = list.filter(t => t.isPinned);
    const rest = list.filter(t => !t.isPinned).sort((a, b) => {
      if (sortBy === 'activity') return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
      if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return b.upvotes - a.upvotes;
    });
    return [...pinned, ...rest];
  }, [activeCategory, search, sortBy]);

  const activeCat = CATEGORIES.find(c => c.id === activeCategory);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.5rem' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '8px',
            background: 'linear-gradient(135deg, #818cf8 0%, #38bdf8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem',
          }}>🗣️</div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#f1f5f9' }}>Community Forum</h1>
        </div>
        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Discuss problems, share solutions, and connect with the community.</p>
      </div>

      {/* Category grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '0.75rem',
        marginBottom: '2rem',
      }}>
        <button
          onClick={() => setActiveCategory('all')}
          style={{
            background: activeCategory === 'all' ? 'rgba(56,189,248,0.12)' : '#1e293b',
            border: `1px solid ${activeCategory === 'all' ? '#38bdf8' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: '10px',
            padding: '1rem',
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'all 150ms ease',
          }}
        >
          <div style={{ fontSize: '1.25rem', marginBottom: '0.4rem' }}>🌐</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: activeCategory === 'all' ? '#38bdf8' : '#f1f5f9', marginBottom: '0.2rem' }}>All Categories</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{THREADS.length} threads</div>
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            style={{
              background: activeCategory === cat.id ? `${cat.color}12` : '#1e293b',
              border: `1px solid ${activeCategory === cat.id ? cat.color : 'rgba(255,255,255,0.06)'}`,
              borderRadius: '10px',
              padding: '1rem',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            <div style={{ fontSize: '1.25rem', marginBottom: '0.4rem' }}>{cat.icon}</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: activeCategory === cat.id ? cat.color : '#f1f5f9', marginBottom: '0.2rem' }}>{cat.name}</div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{cat.threadCount} threads · {cat.postCount} posts</div>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{
        background: '#1e293b',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        padding: '0.875rem 1.25rem',
        marginBottom: '1.25rem',
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        {activeCat && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '0.5rem' }}>
            <span style={{ fontSize: '1rem' }}>{activeCat.icon}</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: activeCat.color }}>{activeCat.name}</span>
            <span style={{ color: '#334155', fontSize: '0.8rem' }}>·</span>
          </div>
        )}
        <input
          type="text"
          placeholder="Search threads…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: '1 1 200px', minWidth: '160px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px', color: '#f1f5f9',
            padding: '7px 12px', fontSize: '0.875rem', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '3px' }}>
          {(['activity', 'newest', 'top'] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)} style={{
              padding: '5px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600,
              border: 'none', cursor: 'pointer', transition: 'all 120ms ease',
              background: sortBy === s ? '#38bdf8' : 'transparent',
              color: sortBy === s ? '#0f172a' : '#64748b',
              textTransform: 'capitalize',
            }}>{s}</button>
          ))}
        </div>
        <Link href="/forum/new" style={{
          marginLeft: 'auto',
          padding: '7px 18px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700,
          background: '#38bdf8', color: '#0f172a', textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          whiteSpace: 'nowrap',
        }}>
          + New Thread
        </Link>
      </div>

      {/* Thread list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', background: '#1e293b', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
            No threads found.
          </div>
        ) : filtered.map(thread => {
          const cat = CATEGORIES.find(c => c.id === thread.categoryId)!;
          return (
            <div key={thread.id} style={{
              background: '#1e293b',
              border: `1px solid ${thread.isPinned ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.06)'}`,
              borderRadius: '10px',
              padding: '1rem 1.25rem',
              display: 'flex',
              gap: '1rem',
              alignItems: 'flex-start',
              transition: 'border-color 150ms ease',
            }}>
              {/* Left: upvote */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '4px', minWidth: '44px', paddingTop: '2px',
              }}>
                <button style={{
                  background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)',
                  borderRadius: '6px', padding: '4px 8px', cursor: 'pointer',
                  color: '#38bdf8', fontSize: '0.75rem',
                }}>▲</button>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8' }}>{thread.upvotes}</span>
              </div>

              {/* Main content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                  {thread.isPinned && (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#38bdf8', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', padding: '1px 7px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📌 Pinned</span>
                  )}
                  {thread.isSolved && (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', padding: '1px 7px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>✓ Solved</span>
                  )}
                  {thread.isLocked && (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)', padding: '1px 7px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🔒 Locked</span>
                  )}
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 600, padding: '1px 7px', borderRadius: '4px',
                    color: cat.color, background: `${cat.color}12`, border: `1px solid ${cat.color}25`,
                  }}>{cat.icon} {cat.name}</span>
                </div>

                <Link href={`/forum/${thread.id}`} style={{ textDecoration: 'none' }}>
                  <h3 style={{
                    fontSize: '0.95rem', fontWeight: 700, color: '#f1f5f9',
                    marginBottom: '0.35rem', lineHeight: 1.4,
                  }}>{thread.title}</h3>
                </Link>

                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.6rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                  {thread.excerpt}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '50%',
                      background: thread.authorColor, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#fff',
                    }}>{thread.author[0].toUpperCase()}</div>
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500 }}>{thread.author}</span>
                  </div>
                  <span style={{ color: '#334155', fontSize: '0.75rem' }}>·</span>
                  <span style={{ fontSize: '0.75rem', color: '#475569' }}>Active {timeAgo(thread.lastActivity)}</span>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {thread.tags.slice(0, 3).map(tag => (
                      <span key={tag} style={{
                        fontSize: '0.65rem', padding: '1px 7px', borderRadius: '4px',
                        color: tagColors[tag] ?? '#64748b',
                        background: `${tagColors[tag] ?? '#64748b'}12`,
                        border: `1px solid ${tagColors[tag] ?? '#64748b'}25`,
                      }}>{tag}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: stats */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
                gap: '6px', minWidth: '80px', flexShrink: 0,
              }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'right' }}>
                  <span style={{ color: '#94a3b8', fontWeight: 600 }}>{thread.replyCount}</span> replies
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'right' }}>
                  <span style={{ color: '#94a3b8', fontWeight: 600 }}>{thread.viewCount}</span> views
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
