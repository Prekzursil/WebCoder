'use client';

// [wave E item 39] Teacher collections meet the classroom: pick one of
// your (or the seeded) study tracks and turn it into a problem-set temă
// in one click — the ladder order becomes A, B, C… and the window
// defaults to two weeks.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TrackService } from '@/services/ApiService';
import type { TrackRow } from '@/types/api';
import { palette } from '@/theme/tokens';

export default function AssignTrackForm({
  classroomId,
  onCreated,
}: {
  classroomId: number;
  onCreated: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const [tracks, setTracks] = useState<TrackRow[] | null>(null);
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    TrackService.list()
      .then((data) => {
        if (!cancelled) setTracks(data.results ?? []);
      })
      .catch(() => {
        if (!cancelled) setTracks([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const assign = async () => {
    if (!slug) return;
    setBusy(true);
    setError(null);
    try {
      await TrackService.assignToClass(classroomId, slug);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (tracks === null || tracks.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginTop: '0.5rem',
      }}
      data-testid="assign-track-form"
    >
      <label style={{ fontSize: '0.8rem' }}>
        {t('assign_track_label', 'Assign a study track')}:{' '}
        <select
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          aria-label={t('assign_track_label', 'Assign a study track')}
          data-testid="assign-track-select"
        >
          <option value="">—</option>
          {tracks.map((track) => (
            <option key={track.slug} value={track.slug}>
              {track.title_i18n?.en || track.slug}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn"
        onClick={assign}
        disabled={busy || !slug}
        data-testid="assign-track-button"
      >
        {busy ? t('assigning', 'Assigning…') : t('assign_track_button', 'Assign')}
      </button>
      {error && <span style={{ color: palette.danger, fontSize: '0.8rem' }}>{error}</span>}
    </div>
  );
}
