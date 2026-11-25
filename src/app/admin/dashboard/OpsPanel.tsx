'use client';

// [Wave G items 136/143/145] The operator panel on the admin dashboard:
// the error stream (productized tracking), the cost projection and the
// worker autoscale recommendation — the same data the scripts use.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/services/ApiService';

interface ErrorsPayload {
  window_hours: number;
  total: number;
  grouped: { digest: string; path: string; method: string; status_code: number; count: number }[];
  events: {
    id: number;
    created_at: string;
    path: string;
    method: string;
    status_code: number;
    message: string;
  }[];
}

interface CostsPayload {
  currency: string;
  period: string;
  lines: Record<string, { formula: string; eur: number }>;
  total: number;
}

interface AutoscalePayload {
  current_workers: number;
  recommended_workers: number;
  direction: string;
  queue_depth: number;
}

export default function OpsPanel() {
  const { t } = useTranslation();
  const [errors, setErrors] = useState<ErrorsPayload | null>(null);
  const [costs, setCosts] = useState<CostsPayload | null>(null);
  const [autoscale, setAutoscale] = useState<AutoscalePayload | null>(null);

  const load = useCallback(() => {
    apiFetch<ErrorsPayload>('/ops/errors/')
      .then(setErrors)
      .catch(() => setErrors(null));
    apiFetch<CostsPayload>('/ops/costs/')
      .then(setCosts)
      .catch(() => setCosts(null));
    apiFetch<AutoscalePayload>('/ops/autoscale/')
      .then(setAutoscale)
      .catch(() => setAutoscale(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const directionKey =
    autoscale?.direction === 'up'
      ? t('ops_scale_up', 'scale up')
      : autoscale?.direction === 'down'
        ? t('ops_scale_down', 'scale down')
        : t('ops_scale_hold', 'hold');

  return (
    <section data-testid="ops-panel" style={{ marginTop: '2rem' }}>
      <h3>{t('ops_header', 'Operations')}</h3>

      <div data-testid="ops-autoscale">
        <h4>{t('ops_autoscale_header', 'Worker autoscaling')}</h4>
        {autoscale ? (
          <p>
            {t('ops_workers', 'Workers')}: {autoscale.current_workers} →{' '}
            {autoscale.recommended_workers} ({directionKey}) · {t('ops_queue_depth', 'queue depth')}
            : {autoscale.queue_depth}
          </p>
        ) : (
          <p>{t('ops_autoscale_unavailable', 'Recommendation unavailable (admin only).')}</p>
        )}
      </div>

      <div data-testid="ops-costs">
        <h4>{t('ops_cost_header', 'Cost projection (EUR/month)')}</h4>
        {costs ? (
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>{t('ops_cost_line', 'Line')}</th>
                <th>{t('ops_cost_formula', 'Formula')}</th>
                <th>EUR</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(costs.lines).map(([key, line]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{line.formula}</td>
                  <td>{line.eur.toFixed(2)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={2}>
                  <strong>{t('ops_cost_total', 'Total')}</strong>
                </td>
                <td data-testid="ops-cost-total">
                  <strong>{costs.total.toFixed(2)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p>{t('ops_cost_unavailable', 'Cost projection unavailable (admin only).')}</p>
        )}
      </div>

      <div data-testid="ops-errors">
        <h4>{t('ops_errors_header', 'Server errors (last 24 h)')}</h4>
        {errors === null ? (
          <p>{t('ops_errors_unavailable', 'Error stream unavailable (admin only).')}</p>
        ) : errors.total > 0 ? (
          <>
            <p data-testid="ops-errors-total">
              {t('ops_errors_total', '{{count}} events', { count: errors.total })}
            </p>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>{t('ops_errors_path', 'Path')}</th>
                  <th>{t('ops_errors_status', 'Status')}</th>
                  <th>{t('ops_errors_count', 'Count')}</th>
                </tr>
              </thead>
              <tbody>
                {errors.grouped.map((group) => (
                  <tr key={group.digest}>
                    <td>
                      {group.method} {group.path}
                    </td>
                    <td>{group.status_code}</td>
                    <td>{group.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p data-testid="ops-errors-empty">
            {t('ops_errors_empty', 'No server errors recorded.')}
          </p>
        )}
      </div>
    </section>
  );
}
