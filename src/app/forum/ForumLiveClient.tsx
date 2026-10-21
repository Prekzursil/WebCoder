'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface LiveUpdate {
  id: number;
  type: 'new_thread' | 'new_reply' | 'solved';
  message: string;
  href: string;
  timestamp: string;
}

const SIMULATED_UPDATES: LiveUpdate[] = [
  { id: 1, type: 'new_thread', message: 'andrei_cp posted: "Trie data structure — when to use it over a hash map?"', href: '/forum', timestamp: '' },
  { id: 2, type: 'new_reply', message: 'ioana_pro replied to "Graph Shortest Path — Dijkstra approach"', href: '/forum/2', timestamp: '' },
  { id: 3, type: 'solved', message: '"How to approach DP problems as a beginner?" was marked as solved', href: '/forum/8', timestamp: '' },
  { id: 4, type: 'new_thread', message: 'stefan_algo posted: "Convex Hull trick — step-by-step walkthrough"', href: '/forum', timestamp: '' },
  { id: 5, type: 'new_reply', message: 'laura_algo replied to "Feature request: Dark/light theme toggle"', href: '/forum/7', timestamp: '' },
  { id: 6, type: 'new_thread', message: 'bogdan_dev posted: "Bug: Code editor loses focus on mobile Safari"', href: '/forum', timestamp: '' },
];

const TYPE_STYLE: Record<LiveUpdate['type'], { icon: string; color: string; label: string }> = {
  new_thread: { icon: '🆕', color: '#38bdf8', label: 'New Thread' },
  new_reply:  { icon: '💬', color: '#4ade80', label: 'New Reply' },
  solved:     { icon: '✓',  color: '#a78bfa', label: 'Solved' },
};

export default function ForumLiveClient() {
  const [updates, setUpdates] = useState<LiveUpdate[]>([]);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [updateIndex, setUpdateIndex] = useState(0);

  const pushUpdate = useCallback(() => {
    const next = SIMULATED_UPDATES[updateIndex % SIMULATED_UPDATES.length];
    const update: LiveUpdate = {
      ...next,
      id: Date.now(),
      timestamp: new Date().toISOString(),
    };
    setUpdates(prev => [update, ...prev].slice(0, 8));
    setVisible(true);
    setUpdateIndex(i => i + 1);
  }, [updateIndex]);

  // First update after 6 seconds, then every 15 seconds
  useEffect(() => {
    const first = setTimeout(pushUpdate, 6000);
    return () => clearTimeout(first);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (updateIndex === 0) return;
    const interval = setInterval(pushUpdate, 15000);
    return () => clearInterval(interval);
  }, [updateIndex, pushUpdate]);

  const visibleUpdates = updates.filter(u => !dismissed.has(u.id));

  if (!visible || visibleUpdates.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      maxWidth: '360px',
      width: '100%',
    }}>
      {visibleUpdates.slice(0, 3).map(update => {
        const style = TYPE_STYLE[update.type];
        return (
          <div
            key={update.id}
            style={{
              background: '#1e293b',
              border: `1px solid ${style.color}30`,
              borderLeft: `3px solid ${style.color}`,
              borderRadius: '10px',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px ${style.color}10`,
              animation: 'slideInRight 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <div style={{
              width: '28px', height: '28px', borderRadius: '6px', flexShrink: 0,
              background: `${style.color}14`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: update.type === 'solved' ? '0.7rem' : '0.85rem',
              color: style.color, fontWeight: 800,
            }}>
              {style.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                <span style={{
                  fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: style.color,
                }}>{style.label}</span>
                <span style={{ fontSize: '0.6rem', color: '#475569' }}>just now</span>
              </div>
              <p style={{
                fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.4,
                margin: 0,
                display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
              }}>{update.message}</p>
            </div>
            <button
              onClick={() => setDismissed(d => new Set([...d, update.id]))}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#475569', fontSize: '0.75rem', padding: '2px',
                flexShrink: 0, lineHeight: 1,
              }}
            >✕</button>
          </div>
        );
      })}
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(24px) scale(0.96); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
