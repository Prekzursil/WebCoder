'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolingService } from '@/services/ApiService';
import { palette } from '@/theme/tokens';

/**
 * UXP-4 — statement revision history: the public "statement changed"
 * banner when a revision exists, expanding into the change feed. Fetches
 * fail-soft (a history outage never breaks the problem page).
 */
export default function StatementHistory({ problemId }: { problemId: number }) {
    const { t } = useTranslation();
    const [count, setCount] = useState<number | null>(null);
    const [open, setOpen] = useState(false);
    const [rows, setRows] = useState<
        { id: number; note: string; edited_by: string | null; created_at: string }[]
    >([]);

    useEffect(() => {
        let cancelled = false;
        ToolingService.getStatementRevisions(problemId)
            .then((data) => {
                if (!cancelled) setCount(data.count);
            })
            .catch(() => {
                if (!cancelled) setCount(0);
            });
        return () => {
            cancelled = true;
        };
    }, [problemId]);

    if (count === null || count === 0) return null;
    return (
        <section data-testid="statement-history" style={{ marginBottom: 16 }}>
            <button
                type="button"
                onClick={async () => {
                    if (!open && rows.length === 0) {
                        const data = await ToolingService.getStatementRevisions(problemId);
                        setRows(data.results);
                    }
                    setOpen(!open);
                }}
                style={{
                    background: 'transparent',
                    border: `1px solid ${palette.border}`,
                    borderRadius: 8,
                    color: palette.warn,
                    cursor: 'pointer',
                    padding: '6px 12px',
                    fontWeight: 600,
                }}
            >
                📝{' '}
                {t(
                    'statement_changed_banner',
                    'This statement has a change history ({{count}} revisions)',
                    { count }
                )}
            </button>
            {open && (
                <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }} data-testid="statement-history-feed">
                    {rows.map((row) => (
                        <li key={row.id} style={{ borderTop: `1px solid ${palette.border}`, padding: '6px 0' }}>
                            {new Date(row.created_at).toLocaleDateString()} —{' '}
                            {row.edited_by ?? t('statement_history_system', 'system')}
                            {row.note ? ` · ${row.note}` : ''}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
