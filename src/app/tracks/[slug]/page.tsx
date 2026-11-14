'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { TrackService } from '@/services/ApiService';
import { TrackDetail } from '@/types/api';
import { palette } from '@/theme/tokens';
import PageHeader from '@/components/common/PageHeader';

/**
 * X12 — one study track: ordered problems with solved checks, a Continue
 * CTA to the first unsolved problem, and owner controls (add/remove/move).
 */
export default function TrackDetailPage() {
  const params = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ro' ? 'ro' : 'en';
  const [track, setTrack] = useState<TrackDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problemId, setProblemId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!params?.slug) return;
    try {
      setTrack(await TrackService.get(params.slug));
    } catch {
      setError(t('tracks_not_found', 'Track not found.'));
    }
  }, [params?.slug, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (error || !track) {
    return (
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        <div role="alert" style={{ color: palette.danger }}>
          {error ?? t('tracks_loading', 'Loading tracks…')}
        </div>
        <Link href="/tracks" style={{ color: palette.accent }}>
          ← {t('tracks_back', 'Back to tracks')}
        </Link>
      </main>
    );
  }

  const run = async (mutation: () => Promise<TrackDetail>) => {
    setBusy(true);
    setActionError(null);
    try {
      setTrack(await mutation());
    } catch (err) {
      setActionError(
        err instanceof Error && err.message
          ? err.message
          : t('tracks_action_error', 'That did not work.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const title = String(track.title_i18n?.[lang] ?? track.title_i18n?.en ?? track.slug);
  const description = String(track.description_i18n?.[lang] ?? track.description_i18n?.en ?? '');
  const firstUnsolved = track.items.find((item) => !item.is_solved);
  const solvedCount = track.items.filter((item) => item.is_solved).length;

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader title={title} subtitle={description || track.owner_username} />
      <p style={{ color: palette.muted, fontSize: '0.9rem' }}>
        {`${solvedCount}/${track.items.length} ${t('tracks_solved_label', 'solved')}`}
        {` · ${track.owner_username}`}
      </p>
      {firstUnsolved ? (
        <Link
          href={`/problems/${firstUnsolved.problem_id}`}
          className="continue-track"
          style={{
            display: 'inline-block',
            marginBottom: 16,
            padding: '10px 18px',
            borderRadius: 10,
            background: palette.accent,
            color: palette.bg,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          {t('tracks_continue', 'Continue')}
        </Link>
      ) : (
        track.items.length > 0 && (
          <p data-testid="track-complete" style={{ color: palette.success }}>
            {t('tracks_complete', 'Track complete — nice work!')}
          </p>
        )
      )}
      <ol style={{ lineHeight: 2.2 }}>
        {track.items.map((item) => (
          <li key={item.problem_id} style={{ listStyle: 'decimal' }}>
            <Link href={`/problems/${item.problem_id}`}>
              {String(item.title_i18n?.[lang] ?? item.title_i18n?.en ?? item.problem_id)}
            </Link>{' '}
            <span style={{ color: palette.muted, fontSize: '0.8rem' }}>{item.difficulty}</span>{' '}
            {item.is_solved && (
              <span data-testid={`track-solved-${item.problem_id}`} aria-label="solved">
                ✓
              </span>
            )}
            {track.is_owner && (
              <span style={{ marginLeft: 10, fontSize: '0.8rem' }}>
                <button
                  type="button"
                  aria-label={t('tracks_move_up', 'Move up')}
                  disabled={busy}
                  onClick={() =>
                    run(() => TrackService.moveProblem(track.slug, item.problem_id, 'up'))
                  }
                >
                  ↑
                </button>{' '}
                <button
                  type="button"
                  aria-label={t('tracks_move_down', 'Move down')}
                  disabled={busy}
                  onClick={() =>
                    run(() => TrackService.moveProblem(track.slug, item.problem_id, 'down'))
                  }
                >
                  ↓
                </button>{' '}
                <button
                  type="button"
                  aria-label={t('tracks_remove_problem', 'Remove from track')}
                  disabled={busy}
                  onClick={() => run(() => TrackService.removeProblem(track.slug, item.problem_id))}
                >
                  ✕
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {track.items.length === 0 && (
        <p style={{ color: palette.muted }}>
          {t('tracks_empty_track', 'This track has no problems yet.')}
        </p>
      )}
      {track.is_owner && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const id = Number(problemId);
            if (!Number.isInteger(id) || id <= 0) {
              setActionError(t('tracks_bad_id', 'Enter a problem id (number).'));
              return;
            }
            setProblemId('');
            run(() => TrackService.addProblem(track.slug, id));
          }}
          style={{
            marginTop: 20,
            borderTop: `1px solid ${palette.border}`,
            paddingTop: 14,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <label htmlFor="track-add-problem">{t('tracks_add_problem', 'Add problem by id')}</label>
          <input
            id="track-add-problem"
            value={problemId}
            onChange={(event) => setProblemId(event.target.value)}
            inputMode="numeric"
            placeholder="42"
            style={{
              width: 90,
              padding: 8,
              borderRadius: 8,
              border: `1px solid ${palette.border}`,
              background: 'transparent',
              color: palette.foreground,
            }}
          />
          <button type="submit" disabled={busy}>
            {t('tracks_add', 'Add')}
          </button>
        </form>
      )}
      {actionError && (
        <p role="alert" style={{ color: palette.danger }}>
          {actionError}
        </p>
      )}
      <p style={{ marginTop: 24 }}>
        <Link href="/tracks" style={{ color: palette.accent }}>
          ← {t('tracks_back', 'Back to tracks')}
        </Link>
      </p>
    </main>
  );
}
