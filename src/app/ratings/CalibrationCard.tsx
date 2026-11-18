'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RatingService } from '@/services/ApiService';
import { CalibrationProfile } from '@/types/api';
import { palette } from '@/theme/tokens';

/**
 * Item 55 — the self-prediction calibration card on the ratings page:
 * how honest your pre-contest rank predictions are (mean absolute error),
 * and whether you skew optimistic or pessimistic.
 */
export default function CalibrationCard({ username }: { username: string }) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<CalibrationProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    RatingService.getCalibration(username)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (error) return null; // the card is optional chrome — never break /ratings
  if (!profile) return null;
  if (profile.count === 0 && profile.results.length === 0) {
    return (
      <p style={{ color: palette.muted, marginBottom: 16 }} data-testid="calibration-empty">
        {t(
          'calibration_empty',
          'No predictions yet — predict your final rank on an upcoming contest and see how calibrated you are.',
        )}
      </p>
    );
  }

  const biasLabel =
    profile.bias === null
      ? null
      : profile.bias < 0
        ? t('calibration_optimist', 'optimistic — you predict better than you land')
        : profile.bias > 0
          ? t('calibration_pessimist', 'pessimistic — you land better than you predict')
          : t('calibration_perfect', 'perfectly calibrated');

  return (
    <div
      data-testid="calibration-card"
      style={{
        border: `1px solid ${palette.border}`,
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 16,
      }}
    >
      <strong>{t('calibration_title', 'Prediction calibration')}</strong>
      {profile.mean_abs_error !== null && (
        <span style={{ color: palette.muted, marginLeft: 12 }} data-testid="calibration-mae">
          {t('calibration_mae', '{{value}} ranks off on average', {
            value: profile.mean_abs_error,
          })}
          {biasLabel ? ` · ${biasLabel}` : ''}
        </span>
      )}
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 8, display: 'grid', gap: 4 }}>
        {profile.results.slice(0, 5).map((row) => (
          <li
            key={row.contest}
            data-testid={`calibration-row-${row.contest}`}
            style={{ fontSize: 14, color: palette.muted }}
          >
            {row.title}: #{row.predicted_rank} →{' '}
            {row.actual_rank === null ? t('calibration_pending', 'pending') : `#${row.actual_rank}`}
            {row.error !== null && (
              <span
                style={{
                  marginLeft: 8,
                  color: row.error < 0 ? palette.danger : palette.success,
                  fontWeight: 700,
                }}
              >
                {row.error > 0 ? `+${row.error}` : row.error}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
