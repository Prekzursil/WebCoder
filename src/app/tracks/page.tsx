'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { TrackService } from '@/services/ApiService';
import { TrackRow } from '@/types/api';
import { palette } from '@/theme/tokens';
import EmptyState from '@/components/common/EmptyState';
import PageHeader from '@/components/common/PageHeader';
import { useAuth } from '@/context/AuthContext';

/**
 * X12 — the study-tracks hub (competitive matrix row 8): curated ordered
 * playlists with per-viewer progress, plus the curator "new track" form.
 */
export default function TracksPage() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const lang = i18n.language === 'ro' ? 'ro' : 'en';
  const [tracks, setTracks] = useState<TrackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [titleEn, setTitleEn] = useState('');
  const [titleRo, setTitleRo] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const role = auth.user?.role ?? '';
  const canCurate =
    auth.isAuthenticated &&
    ['CREATOR', 'TEACHER', 'ADMIN', 'PROBLEM_CREATOR', 'PROBLEM_VERIFIER'].includes(role);

  const load = useCallback(async () => {
    try {
      const data = await TrackService.list();
      setTracks(data.results);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t('tracks_load_error', 'Failed to load tracks.'),
      );
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const createTrack = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await TrackService.create({
        title_en: titleEn,
        ...(titleRo ? { title_ro: titleRo } : {}),
      });
      setTitleEn('');
      setTitleRo('');
      await load();
    } catch (err) {
      setCreateError(
        err instanceof Error && err.message
          ? err.message
          : t('tracks_create_error', 'Could not create the track.'),
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader
        title={t('tracks_title', 'Study tracks')}
        subtitle={t(
          'tracks_subtitle',
          'Curated problem playlists — work through them in order and watch your progress fill in.',
        )}
      />
      {error && (
        <div role="alert" style={{ color: palette.danger }}>
          {error}
        </div>
      )}
      {tracks === null ? (
        <p aria-busy="true">{t('tracks_loading', 'Loading tracks…')}</p>
      ) : tracks.length === 0 ? (
        <EmptyState
          title={t('tracks_empty', 'No tracks yet')}
          description={t(
            'tracks_empty_hint',
            'Creators and teachers assemble ordered problem playlists; they appear here.',
          )}
        />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
          {tracks.map((track) => {
            const title = String(track.title_i18n?.[lang] ?? track.title_i18n?.en ?? track.slug);
            const description = String(
              track.description_i18n?.[lang] ?? track.description_i18n?.en ?? '',
            );
            const progress =
              track.solved_count !== null ? `${track.solved_count}/${track.item_count}` : null;
            return (
              <li
                key={track.slug}
                style={{
                  border: `1px solid ${palette.border}`,
                  borderRadius: 12,
                  padding: '14px 16px',
                }}
              >
                <Link
                  href={`/tracks/${track.slug}`}
                  style={{
                    fontWeight: 700,
                    color: palette.foreground,
                    textDecoration: 'none',
                  }}
                >
                  {title}
                </Link>
                {!track.is_public && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: '0.75rem',
                      color: palette.muted,
                    }}
                  >
                    {t('tracks_unlisted', 'unlisted')}
                  </span>
                )}
                {description && (
                  <p style={{ color: palette.muted, margin: '6px 0 4px' }}>{description}</p>
                )}
                <p style={{ margin: 0, fontSize: '0.85rem', color: palette.muted }}>
                  {`${track.item_count} ${t('tracks_problems_label', 'problems')}`}
                  {progress !== null ? ` · ${progress} ${t('tracks_solved_label', 'solved')}` : ''}
                  {` · ${track.owner_username}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {canCurate && (
        <form
          onSubmit={createTrack}
          style={{
            marginTop: 24,
            borderTop: `1px solid ${palette.border}`,
            paddingTop: 16,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <input
            aria-label={t('tracks_title_en_label', 'Track title (English)')}
            value={titleEn}
            onChange={(event) => setTitleEn(event.target.value)}
            required
            maxLength={200}
            placeholder="Binary search ladder"
            style={{
              padding: 8,
              borderRadius: 8,
              border: `1px solid ${palette.border}`,
              background: 'transparent',
              color: palette.foreground,
            }}
          />
          <input
            aria-label={t('tracks_title_ro_label', 'Track title (Romanian)')}
            value={titleRo}
            onChange={(event) => setTitleRo(event.target.value)}
            maxLength={200}
            placeholder="Scara căutării binare"
            style={{
              padding: 8,
              borderRadius: 8,
              border: `1px solid ${palette.border}`,
              background: 'transparent',
              color: palette.foreground,
            }}
          />
          <button type="submit" disabled={creating || !titleEn.trim()}>
            {t('tracks_create', 'Create track')}
          </button>
          {createError && (
            <span role="alert" style={{ color: palette.danger }}>
              {createError}
            </span>
          )}
        </form>
      )}
    </main>
  );
}
