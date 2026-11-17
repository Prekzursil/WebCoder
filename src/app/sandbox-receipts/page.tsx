'use client';

// [wave E item 20] Sandbox receipts — what the sandbox executed for you.
// Every scratch run and stress run is persisted as an audit row (the
// throttle is the guard; this is the receipt). This page lists the
// caller's own rows: kind, language, status, time/memory, when.

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ReceiptsService } from '@/services/ApiService';
import type { ScratchReceiptRow } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { palette } from '@/theme/tokens';

const STATUS_COLORS: Record<string, string> = {
  OK: palette.success,
  CLEAN: palette.success,
  COMPILE_ERROR: palette.orange,
  RUNTIME_ERROR: palette.danger,
  TIMEOUT: palette.warn,
  FOUND: palette.warn,
};

export default function SandboxReceiptsPage(): ReactNode {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const [rows, setRows] = useState<ScratchReceiptRow[] | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((target: number) => {
    ReceiptsService.mine(target)
      .then((data) => {
        setRows(data.results);
        setCount(data.count);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setRows([]);
      });
  }, []);

  useEffect(() => {
    if (auth.isAuthenticated) load(page);
  }, [auth.isAuthenticated, page, load]);

  if (!auth.isAuthenticated) {
    return (
      <div className="page-container">
        <p>{t('receipts_login_required', 'Log in to see your sandbox receipts.')}</p>
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(count / 20));

  return (
    <div className="page-container">
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.5rem' }}>
        {t('receipts_title', 'Sandbox receipts')}
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>
        {t(
          'receipts_intro',
          'Every scratch run and stress test is recorded — what the sandbox executed for you, when, and how it went.',
        )}
      </p>
      {error && <p style={{ color: palette.danger }}>{error}</p>}
      {rows === null ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>
          {t('receipts_empty', 'No sandbox runs yet — the scratch console creates them.')}
        </p>
      ) : (
        <>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}
            data-testid="receipts-table"
          >
            <thead>
              <tr>
                {[
                  t('receipts_col_kind', 'Kind'),
                  t('language_label', 'Language'),
                  t('verdict_label', 'Verdict'),
                  t('time_label', 'Time'),
                  t('memory_label', 'Memory'),
                  t('submission_time_label', 'Submission Time'),
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '0.5rem',
                      borderBottom: '1px solid var(--border-strong)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.kind}-${row.id}`} data-testid={`receipt-${row.kind}-${row.id}`}>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                    {row.kind}
                  </td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                    {row.language || '—'}
                  </td>
                  <td
                    style={{
                      padding: '0.5rem',
                      borderBottom: '1px solid var(--border)',
                      fontFamily: 'var(--font-mono)',
                      color: STATUS_COLORS[row.status] ?? palette.muted,
                      fontWeight: 700,
                    }}
                  >
                    {row.status}
                  </td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                    {row.time_ms !== null && row.time_ms > 0 ? `${row.time_ms} ms` : '—'}
                  </td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                    {row.memory_kb !== null && row.memory_kb > 0 ? `${row.memory_kb} KB` : '—'}
                  </td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                    {new Date(row.created_at).toLocaleString(i18n.language)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              type="button"
              className="btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('previous_page', 'Previous')}
            </button>
            <span style={{ alignSelf: 'center', fontSize: '0.85rem', color: 'var(--muted)' }}>
              {page} / {pages}
            </span>
            <button
              type="button"
              className="btn"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              {t('next_page', 'Next')}
            </button>
          </div>
        </>
      )}
      <p style={{ marginTop: '1.5rem', fontSize: '0.85rem' }}>
        <Link href="/help/judge">{t('receipts_judge_docs', 'How the judge sandbox works')}</Link>
      </p>
    </div>
  );
}
