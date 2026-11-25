'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContestService } from '@/services/ApiService';
import { ContestPredictionState } from '@/types/api';
import { palette } from '@/theme/tokens';

/**
 * Item 55 — self-prediction: commit a predicted final rank before the
 * contest starts (or before your first submission); the calibration
 * profile on /ratings scores your honesty later.
 */
export default function PredictionPanel({
  contestId,
  isOpen,
}: {
  contestId: number;
  isOpen: boolean;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<ContestPredictionState | null>(null);
  const [rank, setRank] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setState(await ContestService.getPrediction(contestId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    }
  }, [contestId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    const value = Number(rank);
    if (!Number.isInteger(value) || value < 1) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await ContestService.predict(contestId, value);
      setRank('');
      setMessage(t('prediction_saved', 'Prediction saved — final rank #{{rank}}', { rank: value }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="contest-prediction">
      {error && (
        <p role="alert" style={{ color: palette.danger }}>
          {error}
        </p>
      )}
      {state === null ? (
        <p aria-busy="true">{t('prediction_loading', 'Loading your prediction…')}</p>
      ) : (
        <>
          {state.prediction !== null && (
            <p data-testid="prediction-current" style={{ fontWeight: 700 }}>
              {t('prediction_current', 'Your prediction: final rank #{{rank}}', {
                rank: state.prediction,
              })}
            </p>
          )}
          {isOpen ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <input
                type="number"
                min={1}
                value={rank}
                onChange={(e) => setRank(e.target.value)}
                placeholder={t('prediction_placeholder', 'Predicted final rank (e.g. 12)')}
                aria-label={t('prediction_placeholder', 'Predicted final rank (e.g. 12)')}
                style={{ width: 220, padding: '8px 10px' }}
                data-testid="prediction-input"
              />
              <button
                type="button"
                onClick={submit}
                disabled={busy || !rank}
                data-testid="prediction-submit"
              >
                {t('prediction_submit', 'Lock it in')}
              </button>
            </div>
          ) : (
            <p style={{ color: palette.muted }}>
              {t('prediction_closed', 'Predictions are closed for this contest.')}
            </p>
          )}
          {message && <p style={{ color: palette.success }}>{message}</p>}
          <p style={{ color: palette.muted, fontSize: 13, marginTop: 6 }}>
            {t(
              'prediction_hint',
              'Predictions lock at your first submission; your accuracy history lives on the ratings page.',
            )}
          </p>
        </>
      )}
    </div>
  );
}
