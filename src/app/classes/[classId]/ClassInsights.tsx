'use client';

// [wave E items 22/43/44] Teacher-side class surfaces: the effort board
// (attempts + active days ranking), the failure heatmap (students ×
// problems intensity), batch member import by usernames, and report-card
// PDF links per student. Exam PDFs hang off the assignment rows.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ClassroomService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import { palette, hexAlpha } from '@/theme/tokens';

interface EffortRow {
  rank: number;
  user_id: number;
  username: string;
  attempts: number;
  active_days: number;
  problems_solved: number;
}

interface HeatBlock {
  assignment_id: number;
  title_i18n: Record<string, string>;
  problems: { problem_id: number; label: string; points: number }[];
  students: {
    user_id: number;
    username: string;
    cells: { intensity: number | null; attempts: number }[];
  }[];
  failure_rates: { label: string; failure_rate: number }[];
}

function intensityColor(value: number | null): string {
  if (value === null) return 'var(--surface-2)';
  if (value >= 0.75) return hexAlpha(palette.danger, 0.65);
  if (value >= 0.5) return hexAlpha(palette.danger, 0.45);
  if (value >= 0.25) return hexAlpha(palette.warn, 0.45);
  if (value > 0) return hexAlpha(palette.warn, 0.25);
  return hexAlpha(palette.success, 0.45);
}

export default function ClassInsights({ classroomId }: { classroomId: number }): ReactNode {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const [tab, setTab] = useState<'effort' | 'heatmap' | 'import'>('effort');
  const [effort, setEffort] = useState<EffortRow[] | null>(null);
  const [heat, setHeat] = useState<HeatBlock[] | null>(null);
  const [usernames, setUsernames] = useState('');
  const [importResult, setImportResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isTeacher = auth.isAuthenticated && auth.user?.role === 'TEACHER';
  const isAdmin = auth.isAuthenticated && auth.user?.role === 'ADMIN';
  const canSee = isTeacher || isAdmin;

  useEffect(() => {
    if (!canSee) return;
    let cancelled = false;
    ClassroomService.effortBoard(classroomId)
      .then((d) => !cancelled && setEffort(d.results))
      .catch(() => !cancelled && setEffort([]));
    ClassroomService.failureHeatmap(classroomId)
      .then((d) => !cancelled && setHeat(d.assignments))
      .catch(() => !cancelled && setHeat([]));
    return () => {
      cancelled = true;
    };
  }, [classroomId, canSee]);

  if (!canSee) return null;

  const importMembers = async () => {
    setError(null);
    setImportResult(null);
    const list = usernames
      .split(/[\n,;]+/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (list.length === 0) return;
    try {
      const result = await ClassroomService.bulkAddMembers(classroomId, list);
      setImportResult(
        t('import_result', 'Added {{a}} · already members {{b}} · missing: {{m}}', {
          a: result.added,
          b: result.already_members,
          m: result.missing.length ? result.missing.join(', ') : '—',
        }),
      );
      setUsernames('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const lang = i18n.language.startsWith('ro') ? 'ro' : 'en';

  return (
    <section style={{ marginTop: '1.5rem' }} data-testid="class-insights">
      <div style={{ display: 'flex', gap: '6px', marginBottom: '0.75rem' }}>
        {(['effort', 'heatmap', 'import'] as const).map((key) => (
          <button
            key={key}
            type="button"
            className="chip"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            style={
              tab === key
                ? {
                    borderColor: 'var(--accent)',
                    color: 'var(--accent)',
                    background: hexAlpha(palette.accent, 0.12),
                  }
                : undefined
            }
          >
            {t(`insights_tab_${key}`, key)}
          </button>
        ))}
      </div>

      {tab === 'effort' && (
        <div data-testid="effort-board">
          {effort === null ? (
            <p aria-busy="true">…</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  {['#', 'user', 'attempts', 'active days', 'solved'].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        padding: '4px 8px',
                        borderBottom: '1px solid var(--border-strong)',
                      }}
                    >
                      {t(`insights_col_${h.replace(' ', '_')}`, h)}
                    </th>
                  ))}
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '4px 8px',
                      borderBottom: '1px solid var(--border-strong)',
                    }}
                  />
                </tr>
              </thead>
              <tbody>
                {effort.map((row) => (
                  <tr key={row.user_id} data-testid={`effort-${row.username}`}>
                    <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)' }}>
                      {row.rank}
                    </td>
                    <td style={{ padding: '4px 8px' }}>{row.username}</td>
                    <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)' }}>
                      {row.attempts}
                    </td>
                    <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)' }}>
                      {row.active_days}
                    </td>
                    <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)' }}>
                      {row.problems_solved}
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      <a
                        href={ClassroomService.reportCardPdfUrl(classroomId, row.user_id)}
                        target="_blank"
                        rel="noreferrer"
                        data-testid={`report-card-${row.username}`}
                      >
                        {t('insights_report_card', 'report card')}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'heatmap' && (
        <div data-testid="failure-heatmap">
          {heat === null ? (
            <p aria-busy="true">…</p>
          ) : heat.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>{t('insights_no_teme', 'No teme yet.')}</p>
          ) : (
            heat.map((block) => (
              <div key={block.assignment_id} style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                  {block.title_i18n?.[lang] || block.title_i18n?.en}
                </div>
                <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <tbody>
                    {block.students.map((student) => (
                      <tr key={student.user_id} data-testid={`heat-${student.username}`}>
                        <td style={{ padding: '2px 8px' }}>{student.username}</td>
                        {student.cells.map((cell, i) => (
                          <td
                            key={i}
                            title={`${cell.attempts} attempts`}
                            style={{
                              width: '34px',
                              height: '22px',
                              background: intensityColor(cell.intensity),
                              border: '1px solid var(--border)',
                              textAlign: 'center',
                              fontFamily: 'var(--font-mono)',
                              color:
                                cell.intensity !== null && cell.intensity > 0.5
                                  ? '#fff'
                                  : 'var(--foreground)',
                            }}
                          >
                            {cell.attempts || ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      <td style={{ padding: '2px 8px', color: 'var(--text-tertiary)' }}>fail%</td>
                      {block.failure_rates.map((rate) => (
                        <td
                          key={rate.label}
                          data-testid={`failrate-${rate.label}`}
                          style={{
                            textAlign: 'center',
                            fontFamily: 'var(--font-mono)',
                            color:
                              rate.failure_rate >= 0.5 ? palette.danger : 'var(--text-tertiary)',
                          }}
                        >
                          {Math.round(rate.failure_rate * 100)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'import' && (
        <div data-testid="members-import">
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
            {t(
              'insights_import_hint',
              'Paste usernames (comma or newline separated) — existing accounts are enrolled; unknown names are reported.',
            )}
          </p>
          <textarea
            value={usernames}
            onChange={(e) => setUsernames(e.target.value)}
            rows={3}
            style={{ width: '100%', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}
            aria-label={t('insights_import_hint', 'usernames')}
          />
          <button
            type="button"
            className="btn"
            onClick={importMembers}
            disabled={!usernames.trim()}
          >
            {t('insights_import_button', 'Enroll')}
          </button>
          {importResult && (
            <p data-testid="import-result" style={{ marginTop: '8px' }}>
              {importResult}
            </p>
          )}
          {error && <p style={{ color: palette.danger }}>{error}</p>}
        </div>
      )}
    </section>
  );
}
