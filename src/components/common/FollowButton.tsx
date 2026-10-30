'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FollowService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';

/**
 * COM-4 — the follow toggle, by handle. Every public surface (forum
 * thread author, leaderboard row, contest standings) renders usernames,
 * so the by-username lane is the one the UI uses. Renders nothing for
 * anonymous visitors or the viewer's own handle.
 */
export default function FollowButton({ username }: { username: string | null }) {
    const { t } = useTranslation();
    const auth = useAuth();
    const [following, setFollowing] = useState(false);
    const [busy, setBusy] = useState(false);

    if (!auth?.isAuthenticated || !username) return null;
    if (auth.user?.username === username) return null;

    const toggle = async () => {
        setBusy(true);
        try {
            const res = await FollowService.toggleByUsername(username);
            setFollowing(res.following);
        } catch {
            // Stay put silently: a failed toggle should not nag.
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={busy}
            data-testid="follow-button"
            aria-pressed={following}
            style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}
        >
            {following
                ? t('follow_unfollow', 'Unfollow')
                : t('follow_follow', 'Follow')}
        </button>
    );
}
