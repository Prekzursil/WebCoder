'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CommunityService } from '@/services/ApiService';
import { AuthContext } from '@/context/AuthContext';
import { SolutionRow } from '@/types/api';
import { palette } from '@/theme/tokens';

/**
 * COM-7 — post-solve solution browsing. Renders only when the backend
 * grants access (the viewer has their own AC on the problem); the 403
 * payload's reason becomes the locked-state hint. Every payload carries
 * the platform-display license note.
 */
export default function SolutionsPanel({ problemId }: { problemId: number }) {
    const { t } = useTranslation();
    // Direct context read: provider-less test renders stay anonymous.
    const auth = React.useContext(AuthContext);
    const [rows, setRows] = useState<SolutionRow[] | null>(null);
    const [license, setLicense] = useState('');
    const [lockedReason, setLockedReason] = useState<string | null>(null);
    const [openId, setOpenId] = useState<number | null>(null);

    useEffect(() => {
        if (!auth?.isAuthenticated) return;
        let cancelled = false;
        CommunityService.getSolutions(problemId)
            .then((data) => {
                if (cancelled) return;
                setRows(data.results);
                setLicense(data.license);
            })
            .catch((err) => {
                if (cancelled) return;
                setRows(null);
                setLockedReason(
                    err instanceof Error && err.message
                        ? err.message
                        : t('solutions_locked', 'Solve the problem first to browse community solutions.')
                );
            });
        return () => {
            cancelled = true;
        };
    }, [problemId, auth?.isAuthenticated, t]);

    if (!auth?.isAuthenticated) return null;

    return (
        <section
            aria-label={t('solutions_title', 'Community solutions')}
            data-testid="solutions-panel"
        >
            <h3>{t('solutions_title', 'Community solutions')}</h3>
            {lockedReason !== null ? (
                <p data-testid="solutions-locked" style={{ color: palette.muted }}>
                    🔒 {lockedReason}
                </p>
            ) : rows === null ? (
                <p aria-busy="true">{t('solutions_loading', 'Loading solutions…')}</p>
            ) : rows.length === 0 ? (
                <p style={{ color: palette.muted }}>
                    {t('solutions_empty', 'No accepted solutions yet.')}
                </p>
            ) : (
                <>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {rows.map((row) => (
                            <li key={row.id} style={{ borderTop: `1px solid ${palette.border}`, padding: '8px 0' }}>
                                <button
                                    type="button"
                                    data-testid={`solution-toggle-${row.id}`}
                                    onClick={() => setOpenId(openId === row.id ? null : row.id)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: palette.foreground,
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        padding: 0,
                                    }}
                                >
                                    {row.user} · {row.language}
                                </button>
                                {openId === row.id && (
                                    <pre
                                        data-testid={`solution-code-${row.id}`}
                                        style={{
                                            background: 'rgba(127,127,127,0.1)',
                                            padding: 10,
                                            borderRadius: 8,
                                            overflowX: 'auto',
                                            fontSize: '0.85rem',
                                        }}
                                    >
                                        {row.code}
                                    </pre>
                                )}
                            </li>
                        ))}
                    </ul>
                    {license && (
                        <p style={{ color: palette.muted, fontSize: '0.8rem' }}>{license}</p>
                    )}
                </>
            )}
        </section>
    );
}
