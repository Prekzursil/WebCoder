'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ContestService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import UserChip from '@/components/common/UserChip';
import FollowButton from '@/components/common/FollowButton';
import {
    Clarification,
    Contest,
    ContestAwardsResponse,
    ContestProblemRow,
    RatingChangeRow,
    StandingsResponse,
} from '@/types/api';
import { palette, hexAlpha } from '@/theme/tokens';
import * as themeTokens from '@/theme/tokens';
import EmptyState from '@/components/common/EmptyState';
import PageHeader from '@/components/common/PageHeader';

type Tab = 'problems' | 'standings' | 'clarifications' | 'ratings';

export default function ContestDetailPage() {
    const params = useParams<{ contestId: string }>();
    const contestId = params?.contestId;
    const { t, i18n } = useTranslation();
    const auth = useAuth();
    const lang = i18n.language === 'ro' ? 'ro' : 'en';

    const [contest, setContest] = useState<Contest | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>('standings');

    const [problems, setProblems] = useState<ContestProblemRow[] | null>(null);
    const [standings, setStandings] = useState<StandingsResponse | null>(null);
    const [clarifications, setClarifications] = useState<Clarification[] | null>(null);
    const [question, setQuestion] = useState('');
    const [ratingChanges, setRatingChanges] = useState<RatingChangeRow[] | null>(null);
    const [boardSection, setBoardSection] = useState<'official' | 'virtual'>('official');
    // COM-4: friends-only standings (viewer + followed).
    const [friendsOnly, setFriendsOnly] = useState(false);
    const [awards, setAwards] = useState<ContestAwardsResponse | null>(null);

    const loadContest = useCallback(async () => {
        if (!contestId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await ContestService.getContest(contestId);
            setContest(data);
            setTab(data.state === 'RUNNING' ? 'problems' : 'standings');
        } catch (err) {
            setError(
                err instanceof Error && err.message
                    ? err.message
                    : t('contest_load_error', 'Failed to load the contest.')
            );
        } finally {
            setLoading(false);
        }
    }, [contestId, t]);

    useEffect(() => {
        loadContest();
    }, [loadContest]);

    const loadTab = useCallback(
        async (which: Tab) => {
            if (!contestId) return;
            try {
                if (which === 'problems') {
                    const rows = await ContestService.getProblems(contestId);
                    setProblems(rows);
                } else if (which === 'standings') {
                    const board = await ContestService.getStandings(
                        contestId,
                        1,
                        boardSection,
                        friendsOnly
                    );
                    setStandings(board);
                } else if (which === 'clarifications') {
                    const data = await ContestService.getClarifications(contestId);
                    setClarifications(data.results);
                } else if (which === 'ratings') {
                    const data = await ContestService.getRatingChanges(contestId);
                    setRatingChanges(data.changes);
                }
            } catch (err) {
                setActionError(
                    err instanceof Error && err.message
                        ? err.message
                        : t('contest_load_error', 'Failed to load the contest.')
                );
            }
        },
        [contestId, boardSection, friendsOnly, t]
    );

    useEffect(() => {
        if (contest) loadTab(tab);
    }, [contest, tab, loadTab]);

    // CON-11: the medal table appears with the final standings.
    useEffect(() => {
        if (!contestId || !contest || contest.state !== 'FINISHED') return;
        let cancelled = false;
        ContestService.getAwards(contestId)
            .then((data) => {
                if (!cancelled) setAwards(data);
            })
            .catch(() => setAwards(null));
        return () => {
            cancelled = true;
        };
    }, [contestId, contest]);

    const register = async () => {
        if (!contestId) return;
        setActionError(null);
        try {
            await ContestService.register(contestId);
            await loadContest();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : String(err));
        }
    };

    const startClock = async () => {
        if (!contestId) return;
        setActionError(null);
        try {
            await ContestService.startPersonalClock(contestId);
            await loadContest();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : String(err));
        }
    };

    const startVirtual = async () => {
        if (!contestId) return;
        setActionError(null);
        try {
            await ContestService.startVirtual(contestId);
            await loadContest();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : String(err));
        }
    };

    const ask = async () => {
        if (!contestId || !question.trim()) return;
        setActionError(null);
        try {
            await ContestService.askClarification(contestId, question.trim());
            setQuestion('');
            await loadTab('clarifications');
        } catch (err) {
            setActionError(err instanceof Error ? err.message : String(err));
        }
    };

    if (loading) {
        return (
            <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
                <p aria-busy="true">{t('contest_loading', 'Loading contest…')}</p>
            </main>
        );
    }

    if (error || !contest) {
        return (
            <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
                <div role="alert" style={{ color: palette.danger }}>
                    {error ?? t('contest_not_found', 'Contest not found.')}
                </div>
                <Link href="/contests" style={{ color: palette.accent }}>
                    ← {t('contests_back', 'Back to contests')}
                </Link>
            </main>
        );
    }

    const registered = Boolean(contest.my_participation);
    const disqualified = Boolean(contest.my_participation?.is_disqualified);
    const windowNeedsStart =
        contest.is_window && registered && contest.my_participation?.virtual_start == null;
    const canSeeRatings = contest.state === 'FINISHED' && contest.is_rated;

    const tabs: { key: Tab; label: string }[] = [
        { key: 'problems', label: t('contest_tab_problems', 'Problems') },
        { key: 'standings', label: t('contest_tab_standings', 'Standings') },
        ...(auth.isAuthenticated && contest.state === 'RUNNING'
            ? [{ key: 'clarifications' as Tab, label: t('contest_tab_clarifications', 'Clarifications') }]
            : []),
        ...(canSeeRatings
            ? [{ key: 'ratings' as Tab, label: t('contest_tab_rating_changes', 'Rating changes') }]
            : []),
    ];

    const fmt = (iso: string | null) =>
        iso
            ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
            : '—';

    return (
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
            <PageHeader
                title={String(contest.title_i18n[lang] ?? contest.title_i18n.en ?? '')}
                subtitle={`${fmt(contest.start_at)} → ${fmt(contest.end_at)} · ${contest.format}${
                    contest.is_rated ? ` · ★ ${t('contest_rated', 'Rated')}` : ''
                }${contest.is_window ? ` · ⏱ ${t('contest_windowed', 'Windowed')} (${contest.per_user_duration_minutes} min)` : ''}${
                    contest.rated_rating_min != null || contest.rated_rating_max != null
                        ? ` · ${t('contest_division', 'Division')}: ${contest.rated_rating_min ?? 0}–${contest.rated_rating_max ?? '∞'}`
                        : ''
                }`}
            />

            {/* OPS-7 groundwork: sponsor attribution (display-only). */}
            {contest.sponsor_name && (
                <p
                    data-testid="contest-sponsor"
                    style={{
                        margin: '0 0 14px',
                        color: palette.muted,
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.7rem' }}>
                        {t('contest_sponsored_by', 'Sponsored by')}
                    </span>
                    {contest.sponsor_logo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={contest.sponsor_logo_url}
                            alt={contest.sponsor_name}
                            style={{ height: 20, width: 'auto' }}
                        />
                    )}
                    <strong style={{ color: palette.foreground }}>{contest.sponsor_name}</strong>
                </p>
            )}

            {disqualified && (
                <p role="alert" style={{ color: palette.danger, fontWeight: 700 }}>
                    {t('contest_disqualified', 'You were disqualified from this contest.')}
                </p>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                {!auth.isAuthenticated ? (
                    <Link href="/login" style={{ color: palette.accent, fontWeight: 600 }}>
                        {t('contest_login_to_register', 'Log in to register')}
                    </Link>
                ) : !registered && contest.state !== 'FINISHED' ? (
                    <button type="button" onClick={register} style={{ padding: '8px 18px' }}>
                        {t('contest_register', 'Register')}
                    </button>
                ) : null}
                {windowNeedsStart && contest.state === 'RUNNING' && (
                    <button type="button" onClick={startClock} style={{ padding: '8px 18px' }}>
                        {t('contest_start_clock', 'Start my timer')}
                    </button>
                )}
                {registered && contest.my_participation?.virtual_start && (
                    <span style={{ color: palette.muted, alignSelf: 'center' }}>
                        {t('contest_personal_end', 'My deadline:')}{' '}
                        {fmt(contest.my_participation.effective_end)}
                    </span>
                )}
                {auth.isAuthenticated &&
                contest.state === 'FINISHED' &&
                !contest.is_window &&
                !contest.pretest_mode &&
                !contest.my_participation?.is_virtual ? (
                    <button
                        type="button"
                        onClick={startVirtual}
                        data-testid="virtual-start-button"
                        style={{ padding: '8px 18px' }}
                    >
                        ▶ {t('contest_virtual_start', 'Practice virtually')}
                    </button>
                ) : null}
                {contest.my_participation?.is_virtual && (
                    <span
                        data-testid="virtual-active-note"
                        style={{ color: palette.accent, alignSelf: 'center', fontWeight: 600 }}
                    >
                        {t('contest_virtual_running', 'Virtual replay running — ends')}{' '}
                        {fmt(contest.my_participation.effective_end)}
                    </span>
                )}
            </div>

            {actionError && (
                <p role="alert" style={{ color: palette.danger, marginBottom: 12 }}>
                    {actionError}
                </p>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {tabs.map(({ key, label }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        aria-pressed={tab === key}
                        style={{
                            padding: '6px 14px',
                            borderRadius: 8,
                            border: `1px solid ${tab === key ? palette.accent : palette.border}`,
                            background: tab === key ? hexAlpha(palette.accent, 0.15) : 'transparent',
                            color: tab === key ? palette.accent : palette.foreground,
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'problems' && (
                problems === null ? (
                    <p aria-busy="true">{t('contest_loading', 'Loading contest…')}</p>
                ) : problems.length === 0 ? (
                    <EmptyState
                        title={t('contest_no_problems', 'No problems attached')}
                        description={t(
                            'contest_problems_sealed',
                            'Problems are sealed until the contest starts.'
                        )}
                    />
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', color: palette.muted }}>
                                <th style={{ padding: 8 }}>#</th>
                                <th>{t('contest_problem', 'Problem')}</th>
                                <th>{t('contest_points', 'Points')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {problems.map((row) => (
                                <tr key={row.id} style={{ borderTop: `1px solid ${palette.border}` }}>
                                    <td style={{ padding: 8, fontWeight: 700 }}>{row.label}</td>
                                    <td style={{ padding: 8 }}>
                                        {/* During a running contest the submit flow rides
                                            ?contest= so the backend gates + lanes apply. */}
                                        <Link
                                            href={`/problems/${row.problem}?contest=${contest.id}`}
                                            style={{ color: palette.accent }}
                                        >
                                            {row.problem_title[lang] ?? row.problem_title.en}
                                        </Link>
                                    </td>
                                    <td style={{ padding: 8 }}>{row.points}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )
            )}

            {tab === 'standings' &&
                (standings === null ? (
                    <p aria-busy="true">{t('contest_loading', 'Loading contest…')}</p>
                ) : (
                    <>
                        {contest.state === 'FINISHED' && (
                            <div
                                style={{ display: 'flex', gap: 6, marginBottom: 10 }}
                                role="group"
                                aria-label={t('contest_board_section', 'Standings section')}
                            >
                                {(['official', 'virtual'] as const).map((section) => (
                                    <button
                                        key={section}
                                        type="button"
                                        onClick={() => setBoardSection(section)}
                                        aria-pressed={boardSection === section}
                                        data-testid={`board-section-${section}`}
                                        style={{
                                            padding: '4px 12px',
                                            borderRadius: 8,
                                            border: `1px solid ${
                                                boardSection === section
                                                    ? palette.accent
                                                    : palette.border
                                            }`,
                                            background:
                                                boardSection === section
                                                    ? hexAlpha(palette.accent, 0.15)
                                                    : 'transparent',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {section === 'official'
                                            ? t('contest_board_official', 'Official')
                                            : t('contest_board_virtual', 'Virtual replays')}
                                    </button>
                                ))}
                            </div>
                        )}
                        <label
                            data-testid="standings-friends-toggle"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                fontSize: '0.85rem',
                                color: palette.muted,
                                marginLeft: '0.75rem',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={friendsOnly}
                                onChange={(e) => setFriendsOnly(e.target.checked)}
                            />
                            {t('contest_friends_only', 'Friends only')}
                        </label>
                        {awards && awards.count > 0 && boardSection === 'official' && (
                            <p
                                data-testid="contest-awards"
                                style={{ marginBottom: 10, color: palette.muted }}
                            >
                                {awards.results.map((a) => (
                                    <span key={a.user.id} style={{ marginRight: 12 }}>
                                        {a.medal === 'GOLD'
                                            ? '🥇'
                                            : a.medal === 'SILVER'
                                                ? '🥈'
                                                : '🥉'}{' '}
                                        {a.user.username}
                                    </span>
                                ))}
                            </p>
                        )}
                        <StandingsBoard standings={standings} t={t} />
                    </>
                ))}

            {tab === 'clarifications' && (
                <section>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <textarea
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder={t('contest_ask_placeholder', 'Ask the jury…')}
                            aria-label={t('contest_ask_placeholder', 'Ask the jury…')}
                            rows={2}
                            style={{ flex: 1, padding: 8 }}
                        />
                        <button type="button" onClick={ask} style={{ padding: '8px 18px' }}>
                            {t('contest_ask', 'Ask')}
                        </button>
                    </div>
                    {clarifications === null ? (
                        <p aria-busy="true">{t('contest_loading', 'Loading contest…')}</p>
                    ) : clarifications.length === 0 ? (
                        <EmptyState
                            title={t('contest_no_clarifications', 'No questions yet')}
                            description={t(
                                'contest_clarifications_hint',
                                'Your questions and broadcast answers appear here.'
                            )}
                        />
                    ) : (
                        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
                            {clarifications.map((clar) => (
                                <li
                                    key={clar.id}
                                    style={{
                                        border: `1px solid ${palette.border}`,
                                        borderRadius: 10,
                                        padding: '10px 14px',
                                    }}
                                >
                                    <div style={{ color: palette.muted, fontSize: 13 }}>
                                        {clar.asker_username} · {fmt(clar.created_at)}
                                        {clar.is_broadcast
                                            ? ` · 📣 ${t('contest_broadcast', 'Broadcast')}`
                                            : ''}
                                    </div>
                                    <div style={{ marginTop: 4 }}>{clar.question}</div>
                                    {clar.answer && (
                                        <div
                                            style={{
                                                marginTop: 6,
                                                color: palette.success,
                                                fontWeight: 600,
                                            }}
                                        >
                                            ➜ {clar.answer}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {tab === 'ratings' && (
                ratingChanges === null ? (
                    <p aria-busy="true">{t('contest_loading', 'Loading contest…')}</p>
                ) : ratingChanges.length === 0 ? (
                    <EmptyState
                        title={t('contest_no_rating_changes', 'No rating changes')}
                        description={t(
                            'contest_ratings_pending',
                            'Ratings update when the contest finalizes.'
                        )}
                    />
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', color: palette.muted }}>
                                <th style={{ padding: 8 }}>#</th>
                                <th>{t('contest_participant', 'Participant')}</th>
                                <th>{t('contest_rating_before', 'Before')}</th>
                                <th>{t('contest_rating_after', 'After')}</th>
                                <th>Δ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ratingChanges.map((row) => (
                                <tr key={row.username} style={{ borderTop: `1px solid ${palette.border}` }}>
                                    <td style={{ padding: 8 }}>{row.rank}</td>
                                    <td style={{ padding: 8 }}>
                                        <UserChip
                                            username={row.username}
                                            rating={row.display_rating}
                                            href={`/ratings`}
                                        />
                                    </td>
                                    <td style={{ padding: 8 }}>{Math.round(row.rating_before)}</td>
                                    <td style={{ padding: 8 }}>
                                        {Math.round(row.rating_after)}{' '}
                                        <span style={{ color: palette.muted }}>
                                            ({row.display_rating})
                                        </span>
                                    </td>
                                    <td
                                        style={{
                                            padding: 8,
                                            fontWeight: 700,
                                            color: row.delta >= 0 ? palette.success : palette.danger,
                                        }}
                                    >
                                        {row.delta >= 0 ? `+${Math.round(row.delta)}` : Math.round(row.delta)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )
            )}
        </main>
    );
}

interface StandingsBoardProps {
    standings: StandingsResponse;
    // The page's i18next t(), passed in so this stays a pure component.
    t: TFunction;
}

function StandingsBoard({ standings, t }: StandingsBoardProps) {
    const { palette: colors } = themeTokens;
    if ((standings.count ?? 0) === 0) {
        return (
            <EmptyState
                title={t('contest_no_standings', 'Nobody on the board yet')}
                description={t(
                    'contest_register_first',
                    'Register and submit to appear on the scoreboard.'
                )}
            />
        );
    }
    return (
        <>
            {standings.frozen && (
                <p
                    data-testid="standings-frozen-note"
                    style={{ color: colors.warn, fontWeight: 600 }}
                >
                    ❄{' '}
                    {t(
                        'contest_frozen',
                        'Scoreboard frozen — final standings after the contest ends.'
                    )}
                </p>
            )}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ minWidth: 640, width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', color: colors.muted }}>
                            <th style={{ padding: 8 }}>#</th>
                            <th>{t('contest_participant', 'Participant')}</th>
                            {standings.results[0]?.problems.map((cell) => (
                                <th key={cell.label} style={{ padding: 8 }}>
                                    {cell.label}
                                </th>
                            ))}
                            <th>{t('contest_score', 'Score')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {standings.results.map((row) => (
                            <tr
                                key={row.user.id}
                                style={{ borderTop: `1px solid ${colors.border}` }}
                                data-testid={`standings-row-${row.user.username}`}
                            >
                                <td style={{ padding: 8 }}>{row.rank}</td>
                                <td style={{ padding: 8 }}>
                                    <UserChip
                                        username={row.user.username}
                                        href={`/profile/${row.user.id}`}
                                    />{' '}
                                    <FollowButton username={row.user.username} />
                                </td>
                                {row.problems.map((cell) => (
                                    <td
                                        key={cell.label}
                                        style={{
                                            padding: 8,
                                            color:
                                                cell.best >= cell.points_max && cell.points_max > 0
                                                    ? colors.success
                                                    : cell.best > 0
                                                        ? colors.warn
                                                        : 'inherit',
                                        }}
                                        title={
                                            cell.attempts > 0
                                                ? t('contest_attempts', '{{count}} attempts', {
                                                      count: cell.attempts,
                                                  })
                                                : undefined
                                        }
                                    >
                                        {cell.points_max > 0 && cell.best >= cell.points_max
                                            ? `✓ ${cell.best}`
                                            : cell.best}
                                    </td>
                                ))}
                                <td style={{ padding: 8, fontWeight: 700 }}>{row.score}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}
