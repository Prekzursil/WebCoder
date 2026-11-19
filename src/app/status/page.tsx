// Public status page [wave G items 135/139]: overall health, queue
// lanes (judge transparency), 24h judge stats and the 1h error rate —
// aggregate-only data from GET /api/v1/ops/status/.

import { createTranslator, getLocale } from '../_lib/public-i18n';
import { getStatus } from './_lib/status-api';

export const dynamic = 'force-dynamic';

export default async function StatusPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const feed = await getStatus();

  if (!feed) {
    return (
      <div className="page-container" data-testid="status-page">
        <h1 style={{ fontSize: '1.75rem', color: 'var(--foreground)' }}>
          {t('status_title', 'Platform status')}
        </h1>
        <p role="status" data-testid="status-unknown">
          {t(
            'status_unreachable',
            'The status feed is unreachable right now — this page refreshes automatically; if it stays this way, we are already on it.',
          )}
        </p>
      </div>
    );
  }

  const ok = feed.overall === 'ok';
  return (
    <div className="page-container" data-testid="status-page">
      <h1 style={{ fontSize: '1.75rem', color: 'var(--foreground)' }}>
        {t('status_title', 'Platform status')}
      </h1>

      <p
        role="status"
        data-testid="status-overall"
        style={{
          fontWeight: 700,
          color: ok ? 'var(--success, green)' : 'var(--danger, crimson)',
        }}
      >
        {ok
          ? t('status_overall_ok', 'All systems operational')
          : t('status_overall_degraded', 'Degraded — judge backlog is high')}
      </p>
      <p style={{ color: 'var(--muted)' }}>
        {t('status_updated', 'Updated')}: {new Date(feed.generated_at).toISOString()}
      </p>

      <section data-testid="status-components" style={{ marginTop: '1rem' }}>
        <h2>{t('status_components_header', 'Components')}</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li data-testid="status-component-api">
            {t('status_component_api', 'API')}: {feed.components.api.state}
          </li>
          <li data-testid="status-component-judge">
            {t('status_component_judge', 'Judge')}: {feed.components.judge.state}
            {typeof feed.components.judge.backlog === 'number' && (
              <>
                {' '}
                — {t('status_backlog', 'backlog')}: {feed.components.judge.backlog}
              </>
            )}
          </li>
        </ul>
      </section>

      <section data-testid="status-lanes" style={{ marginTop: '1rem' }}>
        <h2>{t('status_lanes_header', 'Judge queue (transparency)')}</h2>
        <p data-testid="status-lane-contest">
          {t('status_lane_contest', 'Contest lane')}: {feed.queue_lanes.contest}
        </p>
        <p data-testid="status-lane-practice">
          {t('status_lane_practice', 'Practice lane')}: {feed.queue_lanes.practice}
        </p>
        <p style={{ color: 'var(--muted)' }}>
          {t(
            'status_lanes_note',
            'Contest submissions run on a dedicated worker lane — a practice burst cannot starve a live contest.',
          )}
        </p>
      </section>

      <section data-testid="status-judge-stats" style={{ marginTop: '1rem' }}>
        <h2>
          {t('status_judge_header', 'Judge — last {{hours}} h', {
            hours: feed.judge_last_24h.window_hours,
          })}
        </h2>
        <p data-testid="status-judge-count">
          {t('status_judge_count', 'Judged submissions')}: {feed.judge_last_24h.judged}
        </p>
        <p data-testid="status-judge-avg">
          {t('status_judge_avg', 'Average execution')}:{' '}
          {feed.judge_last_24h.avg_execution_ms ?? '—'} ms
        </p>
        <p data-testid="status-error-rate">
          {t('status_error_rate', 'Server error rate (1 h)')}:{' '}
          {(feed.error_rate_1h * 100).toFixed(2)}%
        </p>
      </section>
    </div>
  );
}
