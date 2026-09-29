'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { ProblemType } from '@/types';
import type { PublicLocale, PublicTranslator } from '../_lib/public-i18n';

interface ProblemsListClientProps {
  problems: ProblemType[];
  fetchError: string | null;
  locale: PublicLocale;
  t: PublicTranslator;
}

const difficultyColors: Record<string, string> = {
  easy: '#4ade80',
  medium: '#fbbf24',
  hard: '#f87171',
};

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const STATUSES = ['approved', 'pending', 'rejected'];

export default function ProblemsListClient({ problems, fetchError, locale, t }: ProblemsListClientProps) {
  const [search, setSearch] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const filtered = useMemo(() => {
    return problems.filter((p) => {
      const title = p.title_i18n[locale] || p.title_i18n.en || '';
      const matchesSearch = title.toLowerCase().includes(search.toLowerCase());
      const matchesDiff = difficultyFilter
        ? p.difficulty?.toLowerCase() === difficultyFilter
        : true;
      const matchesStatus = statusFilter
        ? p.status?.toLowerCase() === statusFilter
        : true;
      return matchesSearch && matchesDiff && matchesStatus;
    });
  }, [problems, search, difficultyFilter, statusFilter, locale]);

  const hasActiveFilters = search || difficultyFilter || statusFilter;

  const clearFilters = () => {
    setSearch('');
    setDifficultyFilter('');
    setStatusFilter('');
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Page header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          color: '#f1f5f9',
          marginBottom: '0.5rem',
        }}>
          {t('problem_list_header', 'Problems')}
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
          {t('problems_page_description', 'Browse the public competitive programming problem catalog.')}
        </p>
      </div>

      {/* Filter bar */}
      <div style={{
        background: '#1e293b',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        padding: '1rem 1.25rem',
        marginBottom: '1.25rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem',
        alignItems: 'center',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '160px' }}>
          <span style={{
            position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
            color: '#475569', fontSize: '0.85rem', pointerEvents: 'none',
          }}>🔍</span>
          <input
            type="text"
            placeholder="Search problems…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              paddingLeft: '30px',
              paddingRight: '10px',
              paddingTop: '7px',
              paddingBottom: '7px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              color: '#f1f5f9',
              fontSize: '0.875rem',
              outline: 'none',
            }}
          />
        </div>

        {/* Difficulty filter */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Difficulty:
          </span>
          <button
            onClick={() => setDifficultyFilter('')}
            style={{
              padding: '4px 12px',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              border: '1px solid',
              cursor: 'pointer',
              transition: 'all 120ms ease',
              borderColor: !difficultyFilter ? '#38bdf8' : 'rgba(255,255,255,0.1)',
              background: !difficultyFilter ? 'rgba(56,189,248,0.12)' : 'transparent',
              color: !difficultyFilter ? '#38bdf8' : '#64748b',
            }}
          >All</button>
          {DIFFICULTIES.map(d => {
            const color = difficultyColors[d] ?? '#94a3b8';
            const active = difficultyFilter === d;
            return (
              <button
                key={d}
                onClick={() => setDifficultyFilter(active ? '' : d)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`,
                  background: active ? `${color}18` : 'transparent',
                  color: active ? color : '#64748b',
                  cursor: 'pointer',
                  transition: 'all 120ms ease',
                  textTransform: 'capitalize',
                }}
              >
                {d}
              </button>
            );
          })}
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Status:
          </span>
          <button
            onClick={() => setStatusFilter('')}
            style={{
              padding: '4px 12px',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              border: '1px solid',
              cursor: 'pointer',
              transition: 'all 120ms ease',
              borderColor: !statusFilter ? '#38bdf8' : 'rgba(255,255,255,0.1)',
              background: !statusFilter ? 'rgba(56,189,248,0.12)' : 'transparent',
              color: !statusFilter ? '#38bdf8' : '#64748b',
            }}
          >All</button>
          {STATUSES.map(s => {
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(active ? '' : s)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: `1px solid ${active ? 'rgba(148,163,184,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  background: active ? 'rgba(148,163,184,0.12)' : 'transparent',
                  color: active ? '#94a3b8' : '#64748b',
                  cursor: 'pointer',
                  transition: 'all 120ms ease',
                  textTransform: 'capitalize',
                }}
              >
                {s}
              </button>
            );
          })}
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            style={{
              padding: '4px 12px',
              borderRadius: '8px',
              fontSize: '0.75rem',
              fontWeight: 500,
              border: '1px solid rgba(248,113,113,0.3)',
              background: 'rgba(248,113,113,0.08)',
              color: '#f87171',
              cursor: 'pointer',
              marginLeft: 'auto',
              transition: 'all 120ms ease',
            }}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Results count */}
      {!fetchError && problems.length > 0 && (
        <div style={{ marginBottom: '0.75rem', fontSize: '0.8rem', color: '#475569' }}>
          Showing <span style={{ color: '#94a3b8', fontWeight: 600 }}>{filtered.length}</span>
          {hasActiveFilters && ` of ${problems.length}`} problem{filtered.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Error state */}
      {fetchError ? (
        <div style={{
          padding: '1.25rem 1.5rem',
          borderRadius: '10px',
          background: 'rgba(248, 113, 113, 0.08)',
          border: '1px solid rgba(248, 113, 113, 0.2)',
          color: '#f87171',
          fontSize: '0.9rem',
        }}>
          {t('problems_load_error', 'Could not load problems: ')}{fetchError}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          color: '#64748b',
          background: '#1e293b',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {hasActiveFilters
            ? 'No problems match your filters.' : t('no_problems_available', 'No problems available at the moment.')}
        </div>
      ) : (
        <div style={{
          background: '#1e293b',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['#', 'Title', 'Difficulty', 'Status'].map((label, i) => (
                  <th key={label} style={{
                    padding: '12px 20px',
                    textAlign: 'left',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    color: '#64748b',
                    width: i === 0 ? '60px' : undefined,
                  }}>
                    {i === 1 ? t('problem_title_th', label) :
                     i === 2 ? t('problem_difficulty_th', label) :
                     i === 3 ? t('problem_status_th', label) : label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((problem, idx) => {
                const diff = problem.difficulty?.toLowerCase() ?? '';
                const diffColor = difficultyColors[diff] ?? '#94a3b8';
                return (
                  <tr key={problem.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '14px 20px', color: '#475569', fontSize: '0.8rem' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <Link href={`/problems/${problem.id}`} style={{
                        color: '#f1f5f9',
                        fontWeight: 500,
                        fontSize: '0.9rem',
                        textDecoration: 'none',
                        transition: 'color 150ms ease',
                      }}>
                        {problem.title_i18n[locale] || problem.title_i18n.en || `Problem #${problem.id}`}
                      </Link>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 10px',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: diffColor,
                        background: `${diffColor}18`,
                        border: `1px solid ${diffColor}30`,
                      }}>
                        {t(`difficulty_${diff}`, problem.difficulty)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 10px',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        color: '#94a3b8',
                        background: 'rgba(148,163,184,0.08)',
                        border: '1px solid rgba(148,163,184,0.15)',
                      }}>
                        {t(`status_${problem.status?.toLowerCase()}`, problem.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
