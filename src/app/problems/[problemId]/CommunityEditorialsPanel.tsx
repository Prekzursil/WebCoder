'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CommunityService } from '@/services/ApiService';
import { AuthContext } from '@/context/AuthContext';
import { CommunityEditorialRow } from '@/types/api';
import EditorialEtiquetteBanner from './EditorialEtiquetteBanner';
import { palette } from '@/theme/tokens';

/**
 * EDT-3/EDT-4 — the community editorials panel on the problem page:
 * author-attributed rows with the CC BY-SA license line, an EN/RO filter,
 * and (for creators/teachers/verifiers) the write form. Rows land in the
 * approval queue (PENDING) — nothing shows until a verifier approves.
 */
export default function CommunityEditorialsPanel({ problemId }: { problemId: number }) {
    const { t } = useTranslation();
    // Direct context read: server-rendered pages without an AuthProvider
    // still mount this panel (undefined context == anonymous).
    const auth = React.useContext(AuthContext);

    const [rows, setRows] = useState<CommunityEditorialRow[] | null>(null);
    const [filter, setFilter] = useState<'' | 'ro' | 'en'>('');
    const [writing, setWriting] = useState(false);
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [writeLang, setWriteLang] = useState<'ro' | 'en'>('en');
    const [error, setError] = useState<string | null>(null);
    const [openId, setOpenId] = useState<number | null>(null);

    const load = useCallback(async () => {
        try {
            const data = await CommunityService.getCommunityEditorials(problemId, {
                lang: filter || undefined,
            });
            setRows(data.results);
        } catch {
            setRows([]);
        }
    }, [problemId, filter]);

    useEffect(() => {
        load();
    }, [load]);

    const role = auth?.user?.role;
    const canWrite =
        role !== undefined &&
        ['CREATOR', 'TEACHER', 'ADMIN', 'VERIFIER', 'PROBLEM_CREATOR'].includes(role);

    const submit = async () => {
        if (!title.trim() || !body.trim()) return;
        setError(null);
        try {
            await CommunityService.createCommunityEditorial(problemId, {
                title: title.trim(),
                body: body.trim(),
                lang: writeLang,
            });
            setWriting(false);
            setTitle('');
            setBody('');
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    return (
        <section
            aria-label={t('community_editorials', 'Community editorials')}
            data-testid="community-editorials"
        >
            <h3 style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                {t('community_editorials', 'Community editorials')}
                {(['', 'en', 'ro'] as const).map((code) => (
                    <button
                        key={code || 'all'}
                        type="button"
                        onClick={() => setFilter(code)}
                        aria-pressed={filter === code}
                        data-testid={`ce-filter-${code || 'all'}`}
                        style={{
                            fontSize: '0.75rem',
                            padding: '2px 10px',
                            borderRadius: 8,
                            border: `1px solid ${filter === code ? palette.accent : palette.border}`,
                            background: 'transparent',
                            color: filter === code ? palette.accent : palette.muted,
                            cursor: 'pointer',
                        }}
                    >
                        {code ? code.toUpperCase() : t('filter_all', 'All')}
                    </button>
                ))}
            </h3>
            <EditorialEtiquetteBanner />

            {(rows ?? []).length === 0 ? (
                <p style={{ color: palette.muted }}>
                    {t('community_editorials_empty', 'No community editorials yet.')}
                </p>
            ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {(rows ?? []).map((row) => (
                        <li
                            key={row.id}
                            style={{
                                borderTop: `1px solid ${palette.border}`,
                                padding: '10px 0',
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setOpenId(openId === row.id ? null : row.id)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: palette.foreground,
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    padding: 0,
                                }}
                                data-testid={`ce-row-${row.id}`}
                            >
                                {row.title}
                            </button>{' '}
                            <span style={{ color: palette.muted, fontSize: '0.85rem' }}>
                                {row.author_username} · {row.lang.toUpperCase()} ·{' '}
                                {row.status !== 'APPROVED' ? row.status : 'CC BY-SA 4.0'}
                            </span>
                            {openId === row.id && (
                                <p
                                    data-testid={`ce-body-${row.id}`}
                                    style={{
                                        whiteSpace: 'pre-wrap',
                                        background: 'rgba(127,127,127,0.08)',
                                        padding: 10,
                                        borderRadius: 8,
                                    }}
                                >
                                    {row.body}
                                </p>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {canWrite && !writing && (
                <button type="button" onClick={() => setWriting(true)} data-testid="ce-write-button">
                    + {t('community_editorial_write', 'Write an editorial')}
                </button>
            )}
            {writing && (
                <div style={{ display: 'grid', gap: 8, marginTop: 10, maxWidth: 520 }}>
                    <input
                        aria-label={t('community_editorial_title', 'Title')}
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        style={{ padding: 8, borderRadius: 8, border: `1px solid ${palette.border}` }}
                    />
                    <select
                        aria-label={t('community_editorial_lang', 'Language')}
                        value={writeLang}
                        onChange={(event) => setWriteLang(event.target.value as 'ro' | 'en')}
                        style={{ padding: 8, borderRadius: 8, border: `1px solid ${palette.border}` }}
                    >
                        <option value="en">English</option>
                        <option value="ro">Română</option>
                    </select>
                    <textarea
                        aria-label={t('community_editorial_body', 'Body (markdown)')}
                        rows={6}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        style={{ padding: 8, borderRadius: 8, border: `1px solid ${palette.border}` }}
                    />
                    {error && (
                        <p role="alert" style={{ color: palette.danger }}>
                            {error}
                        </p>
                    )}
                    <p style={{ color: palette.muted, fontSize: '0.8rem' }}>
                        {t(
                            'community_editorial_license_note',
                            'Submitting licenses your text CC BY-SA 4.0 (see Terms). It enters review before publishing.'
                        )}
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={submit} data-testid="ce-submit">
                            {t('community_editorial_submit', 'Submit for review')}
                        </button>
                        <button type="button" onClick={() => setWriting(false)}>
                            {t('cancel', 'Cancel')}
                        </button>
                    </div>
                </div>
            )}
            <p style={{ color: palette.muted, fontSize: '0.8rem' }}>
                {t('community_editorials_license_note', 'Community editorial text is licensed CC BY-SA 4.0 by its authors.')}
            </p>
        </section>
    );
}
