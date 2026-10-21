'use client';

import React, { useState } from 'react';


interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  solved: number;
  submissions: number;
  successRate: number;
  badge: 'gold' | 'silver' | 'bronze' | null;
}

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, username: 'alex_coder', score: 4820, solved: 142, submissions: 178, successRate: 79.8, badge: 'gold' },
  { rank: 2, username: 'mihai_dev', score: 4310, solved: 128, submissions: 161, successRate: 79.5, badge: 'silver' },
  { rank: 3, username: 'ioana_pro', score: 3990, solved: 119, submissions: 155, successRate: 76.8, badge: 'bronze' },
  { rank: 4, username: 'stefan_algo', score: 3750, solved: 111, submissions: 148, successRate: 75.0, badge: null },
  { rank: 5, username: 'radu_bits', score: 3480, solved: 104, submissions: 140, successRate: 74.3, badge: null },
  { rank: 6, username: 'ana_solve', score: 3210, solved: 96, submissions: 132, successRate: 72.7, badge: null },
  { rank: 7, username: 'vlad_code', score: 2980, solved: 89, submissions: 125, successRate: 71.2, badge: null },
  { rank: 8, username: 'elena_cp', score: 2750, solved: 82, submissions: 118, successRate: 69.5, badge: null },
  { rank: 9, username: 'dan_prog', score: 2530, solved: 76, submissions: 112, successRate: 67.9, badge: null },
  { rank: 10, username: 'cristina_x', score: 2310, solved: 69, submissions: 105, successRate: 65.7, badge: null },
  { rank: 11, username: 'bogdan_dev', score: 2100, solved: 63, submissions: 99, successRate: 63.6, badge: null },
  { rank: 12, username: 'laura_algo', score: 1890, solved: 57, submissions: 93, successRate: 61.3, badge: null },
  { rank: 13, username: 'andrei_cp', score: 1680, solved: 50, submissions: 87, successRate: 57.5, badge: null },
  { rank: 14, username: 'maria_code', score: 1470, solved: 44, submissions: 81, successRate: 54.3, badge: null },
  { rank: 15, username: 'george_bits', score: 1260, solved: 38, submissions: 75, successRate: 50.7, badge: null },
];

const badgeColors: Record<string, { bg: string; color: string; label: string }> = {
  gold: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24', label: '🥇' },
  silver: { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', label: '🥈' },
  bronze: { bg: 'rgba(180,120,60,0.15)', color: '#b47c3c', label: '🥉' },
};

type SortKey = 'rank' | 'score' | 'solved' | 'successRate';

export default function LeaderboardPage() {
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'rank' ? 'asc' : 'desc');
    }
  };

  const filtered = MOCK_LEADERBOARD
    .filter(e => e.username.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      return (a[sortKey] - b[sortKey]) * mul;
    });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span style={{ color: '#334155', marginLeft: 4 }}>↕</span>;
    return <span style={{ color: '#38bdf8', marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.5rem' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '8px',
            background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem',
          }}>🏆</div>
          <h1 style={{
            fontSize: '1.75rem', fontWeight: 800,
            letterSpacing: '-0.03em', color: '#f1f5f9',
          }}>Leaderboard</h1>
        </div>
        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
          Top competitive programmers ranked by total score.
        </p>
      </div>

      {/* Top 3 podium cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        {MOCK_LEADERBOARD.slice(0, 3).map((entry) => {
          const badge = badgeColors[entry.badge!];
          return (
            <div key={entry.rank} style={{
              background: '#1e293b',
              border: `1px solid ${badge.color}30`,
              borderRadius: '12px',
              padding: '1.5rem',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                background: `linear-gradient(90deg, transparent, ${badge.color}, transparent)`,
              }} />
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{badge.label}</div>
              <div style={{
                fontSize: '1rem', fontWeight: 700, color: '#f1f5f9',
                marginBottom: '0.25rem',
              }}>{entry.username}</div>
              <div style={{
                fontSize: '1.5rem', fontWeight: 800, color: badge.color,
                marginBottom: '0.5rem',
              }}>{entry.score.toLocaleString()}</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  <span style={{ color: '#4ade80', fontWeight: 600 }}>{entry.solved}</span> solved
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  <span style={{ color: '#38bdf8', fontWeight: 600 }}>{entry.successRate}%</span> rate
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search by username…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%',
            maxWidth: '320px',
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px',
            color: '#f1f5f9',
            padding: '8px 14px',
            fontSize: '0.875rem',
            outline: 'none',
          }}
        />
      </div>

      {/* Table */}
      <div style={{
        background: '#1e293b',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {([
                { key: 'rank', label: 'Rank' },
                { key: null, label: 'User' },
                { key: 'score', label: 'Score' },
                { key: 'solved', label: 'Solved' },
                { key: null, label: 'Submissions' },
                { key: 'successRate', label: 'Success Rate' },
              ] as { key: SortKey | null; label: string }[]).map(({ key, label }) => (
                <th
                  key={label}
                  onClick={key ? () => handleSort(key) : undefined}
                  style={{
                    padding: '12px 20px',
                    textAlign: 'left',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    color: '#64748b',
                    cursor: key ? 'pointer' : 'default',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                  {key && <SortIcon col={key} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{
                  padding: '3rem', textAlign: 'center',
                  color: '#64748b', fontSize: '0.9rem',
                }}>
                  No users found.
                </td>
              </tr>
            ) : filtered.map((entry) => {
              const badge = entry.badge ? badgeColors[entry.badge] : null;
              return (
                <tr key={entry.rank} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: '28px', height: '28px', borderRadius: '6px',
                      background: badge ? `${badge.color}18` : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${badge ? `${badge.color}30` : 'rgba(255,255,255,0.06)'}`,
                      fontSize: '0.8rem', fontWeight: 700,
                      color: badge ? badge.color : '#64748b',
                    }}>
                      {entry.rank}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: `hsl(${(entry.username.charCodeAt(0) * 37) % 360}, 55%, 35%)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.8rem', fontWeight: 700, color: '#fff',
                        flexShrink: 0,
                      }}>
                        {entry.username[0].toUpperCase()}
                      </div>
                      <span style={{ color: '#f1f5f9', fontWeight: 500, fontSize: '0.9rem' }}>
                        {entry.username}
                      </span>
                      {badge && <span style={{ fontSize: '0.85rem' }}>{badge.label}</span>}
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.95rem' }}>
                      {entry.score.toLocaleString()}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '2px 10px', borderRadius: '999px',
                      fontSize: '0.75rem', fontWeight: 600,
                      color: '#4ade80', background: 'rgba(74,222,128,0.1)',
                      border: '1px solid rgba(74,222,128,0.2)',
                    }}>
                      {entry.solved}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px', color: '#94a3b8', fontSize: '0.875rem' }}>
                    {entry.submissions}
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        flex: 1, maxWidth: '80px', height: '4px',
                        background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%', borderRadius: '2px',
                          width: `${entry.successRate}%`,
                          background: entry.successRate >= 70
                            ? '#4ade80'
                            : entry.successRate >= 50
                              ? '#fbbf24' :'#f87171',
                        }} />
                      </div>
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {entry.successRate}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#475569', textAlign: 'center' }}>
        Leaderboard updates daily. Rankings based on accepted submissions and problem difficulty.
      </p>
    </div>
  );
}
