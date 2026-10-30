'use client';

// COM-5 (owner reversal 2026-10-30): private 1:1 message threads — the
// inbox surface. Threads list with unread badges + last-message excerpt,
// a start-thread composer, the viewer's block (mute) list, and — for
// moderators/admins — the message-report queue and the admin audit
// (metadata-only) view. Bodies render as TEXT ONLY in the thread page;
// this page never renders message markdown.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { MessagingService } from '@/services/ApiService';
import { ApiBlock, ApiConversation, ApiMessageReport } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { palette } from '@/theme/tokens';
import EmptyState from '@/components/common/EmptyState';
import PageHeader from '@/components/common/PageHeader';
import ProtectedRoute from '@/components/common/ProtectedRoute';

/** Moderators of the message-report queue: the verifier/admin cohort
 * (the backend's IsModerator also honors Django staff, but the auth
 * session exposes only the role to the client). */
function isModerator(role?: string): boolean {
    return role === 'ADMIN' || role === 'PROBLEM_VERIFIER';
}

function ThreadsList({ conversations }: { conversations: ApiConversation[] }) {
    const { t } = useTranslation();
    if (conversations.length === 0) {
        return (
            <EmptyState
                title={t('msgs_empty_title', 'No conversations yet')}
                description={t('msgs_empty_body', 'Start one with a classmate or teacher from the box above.')}
            />
        );
    }
    return (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {conversations.map((conversation) => (
                <li key={conversation.id} style={{ borderBottom: `1px solid ${palette.border}` }}>
                    <Link
                        href={`/messages/${conversation.id}`}
                        data-testid={`msg-thread-${conversation.id}`}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '14px 8px',
                            textDecoration: 'none',
                            color: palette.foreground,
                        }}
                    >
                        <span
                            aria-hidden
                            style={{
                                width: 38,
                                height: 38,
                                borderRadius: '50%',
                                background: palette.surface2,
                                display: 'grid',
                                placeItems: 'center',
                                fontWeight: 700,
                                color: palette.accent,
                                flexShrink: 0,
                            }}
                        >
                            {conversation.other_user.username.slice(0, 2).toUpperCase()}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontWeight: 600 }}>
                                {conversation.other_user.username}
                            </span>
                            <span
                                style={{
                                    display: 'block',
                                    color: palette.muted,
                                    fontSize: 13,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {conversation.last_message
                                    ? conversation.last_message.excerpt
                                    : t('msgs_no_messages', 'No messages yet')}
                            </span>
                        </span>
                        {conversation.unread_count > 0 && (
                            <span
                                aria-label={t('msgs_unread_aria', '{{count}} unread', {
                                    count: conversation.unread_count,
                                })}
                                style={{
                                    background: palette.accent,
                                    color: palette.bg,
                                    borderRadius: 999,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    padding: '2px 9px',
                                    flexShrink: 0,
                                }}
                            >
                                {conversation.unread_count}
                            </span>
                        )}
                    </Link>
                </li>
            ))}
        </ul>
    );
}

function StartThreadForm() {
    const { t } = useTranslation();
    const [username, setUsername] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const handle = username.trim().replace(/^@/, '');
        if (!handle || busy) return;
        setBusy(true);
        setError(null);
        try {
            const conversation = await MessagingService.startThread({ username: handle });
            setUsername('');
            window.location.assign(`/messages/${conversation.id}`);
        } catch (err) {
            const detail = (err as Error)?.message ?? '';
            if (detail === 'self') {
                setError(t('msgs_err_self', 'You cannot message yourself.'));
            } else if (detail === 'blocked') {
                setError(t('msgs_err_blocked', 'This user cannot receive your messages.'));
            } else if (detail === 'minor_policy') {
                setError(t('msgs_err_minor', 'This account only accepts messages from followed users or classmates.'));
            } else if (detail === 'No such user.') {
                setError(t('msgs_err_unknown', 'No user with that username.'));
            } else {
                setError(t('msgs_err_generic', 'Could not start the conversation.'));
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <input
                id="msg-new-username"
                aria-label={t('msgs_new_label', 'Start a conversation with username')}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={t('msgs_new_placeholder', 'username')}
                autoComplete="off"
                style={{
                    flex: 1,
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: `1px solid ${palette.borderStrong}`,
                    background: palette.surface,
                    color: palette.foreground,
                }}
            />
            <button
                type="submit"
                disabled={busy || !username.trim()}
                data-testid="msg-start"
                style={{
                    padding: '9px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: busy || !username.trim() ? palette.surface2 : palette.accent,
                    color: palette.bg,
                    fontWeight: 700,
                    cursor: busy ? 'wait' : 'pointer',
                }}
            >
                {t('msgs_new_button', 'Message')}
            </button>
            {error && (
                <p role="alert" style={{ margin: 0, color: palette.danger }}>
                    {error}
                </p>
            )}
        </form>
    );
}

function BlockList() {
    const { t } = useTranslation();
    const [blocks, setBlocks] = useState<ApiBlock[]>([]);
    const [open, setOpen] = useState(false);

    const load = useCallback(async () => {
        const response = await MessagingService.getBlocks();
        setBlocks(response.results);
    }, []);

    useEffect(() => {
        if (open) void load();
    }, [open, load]);

    const unblock = async (userId: number) => {
        await MessagingService.unblockUser(userId);
        await load();
    };

    return (
        <section style={{ marginTop: 28 }}>
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                data-testid="msg-blocks-toggle"
                style={{
                    background: 'none',
                    border: 'none',
                    color: palette.muted,
                    cursor: 'pointer',
                    padding: 0,
                    fontWeight: 600,
                }}
            >
                {t('msgs_blocklist_title', 'Blocked users')} ({blocks.length})
            </button>
            {open && (
                <div style={{ marginTop: 10 }}>
                    {blocks.length === 0 ? (
                        <p style={{ color: palette.muted }}>
                            {t('msgs_blocklist_empty', 'You have not blocked anyone.')}
                        </p>
                    ) : (
                        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {blocks.map((block) => (
                                <li
                                    key={block.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        background: palette.surface,
                                        border: `1px solid ${palette.border}`,
                                        borderRadius: 999,
                                        padding: '4px 6px 4px 12px',
                                    }}
                                >
                                    <span>{block.blocked.username}</span>
                                    <button
                                        type="button"
                                        onClick={() => void unblock(block.blocked.id)}
                                        aria-label={t('msgs_unblock_aria', 'Unblock {{name}}', {
                                            name: block.blocked.username,
                                        })}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: palette.accent,
                                            cursor: 'pointer',
                                            fontWeight: 600,
                                        }}
                                    >
                                        ×
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </section>
    );
}

function ModerationQueue() {
    const { t } = useTranslation();
    const [reports, setReports] = useState<ApiMessageReport[]>([]);
    const [busyId, setBusyId] = useState<number | null>(null);

    const load = useCallback(async () => {
        const response = await MessagingService.getReports('OPEN');
        setReports(response.results);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const resolve = async (reportId: number, action: 'resolved' | 'dismissed') => {
        setBusyId(reportId);
        try {
            await MessagingService.resolveReport(reportId, action);
            await load();
        } finally {
            setBusyId(null);
        }
    };

    return (
        <section style={{ marginTop: 36 }} data-testid="msg-mod-queue">
            <h2 style={{ fontSize: 18 }}>{t('msgs_mod_title', 'Message reports')}</h2>
            {reports.length === 0 ? (
                <p style={{ color: palette.muted }}>{t('msgs_mod_empty', 'No open message reports.')}</p>
            ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {reports.map((report) => (
                        <li
                            key={report.id}
                            data-testid={`msg-report-${report.id}`}
                            style={{
                                background: palette.surface,
                                border: `1px solid ${palette.border}`,
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                            }}
                        >
                            <p style={{ margin: '0 0 6px', fontWeight: 600 }}>
                                {report.message.sender.username} → {report.message.body.slice(0, 140)}
                            </p>
                            <p style={{ margin: '0 0 10px', color: palette.muted, fontSize: 13 }}>
                                {t('msgs_mod_reason', 'Reason')}: {report.reason}
                                {report.details ? ` — ${report.details}` : ''} · {t('msgs_mod_by', 'by')}{' '}
                                {report.reporter.username}
                            </p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    type="button"
                                    disabled={busyId === report.id}
                                    data-testid={`msg-resolve-${report.id}`}
                                    onClick={() => void resolve(report.id, 'resolved')}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: 8,
                                        border: 'none',
                                        background: palette.success,
                                        color: palette.bg,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {t('msgs_mod_resolve', 'Resolve')}
                                </button>
                                <button
                                    type="button"
                                    disabled={busyId === report.id}
                                    data-testid={`msg-dismiss-${report.id}`}
                                    onClick={() => void resolve(report.id, 'dismissed')}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: 8,
                                        border: `1px solid ${palette.borderStrong}`,
                                        background: 'none',
                                        color: palette.muted,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {t('msgs_mod_dismiss', 'Dismiss')}
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export default function MessagesPage() {
    const { t } = useTranslation();
    const auth = useAuth();
    const [conversations, setConversations] = useState<ApiConversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        MessagingService.getThreads()
            .then((response) => {
                if (!cancelled) setConversations(response.results);
            })
            .catch(() => {
                if (!cancelled) setError(t('msgs_load_error', 'Could not load your conversations.'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [t]);

    const moderator = isModerator(auth.user?.role);

    return (
        <ProtectedRoute>
            <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px 64px' }}>
                <PageHeader title={t('msgs_title', 'Messages')} subtitle={t('msgs_subtitle', 'Private 1:1 conversations')} />
                <StartThreadForm />
                {loading ? (
                    <p role="status">{t('msgs_loading', 'Loading…')}</p>
                ) : error ? (
                    <p role="alert" style={{ color: palette.danger }}>
                        {error}
                    </p>
                ) : (
                    <ThreadsList conversations={conversations} />
                )}
                <BlockList />
                {moderator && <ModerationQueue />}
            </main>
        </ProtectedRoute>
    );
}
