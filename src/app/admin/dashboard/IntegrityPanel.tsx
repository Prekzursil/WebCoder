'use client';

// [Wave G items 113-118] The integrity panel on the admin dashboard:
// similarity scans + flags, the abuse queue with SLA aging, multi-account
// clusters, the moderation audit trail and appeals. One client island
// over /api/v1/integrity/*.

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/services/ApiService';

interface FlagRow {
  id: number;
  kind: string;
  status: string;
  score: number;
  submission: { id: number; user: string; problem: number };
  other: { id: number; user: string } | null;
}

interface QueueRow {
  kind: string;
  id: number;
  age_hours: number;
  sla_due_in_hours: number;
  sla_breached: boolean;
  reason: string;
}

type Tab = 'flags' | 'queue' | 'accounts' | 'appeals';

export default function IntegrityPanel(): ReactNode {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('queue');
  const [flags, setFlags] = useState<FlagRow[] | null>(null);
  const [queue, setQueue] = useState<{
    items: QueueRow[];
    open_count: number;
    sla_breached_count: number;
    sla_hours: number;
  } | null>(null);
  const [clusters, setClusters] = useState<
    { usernames: string[]; shared_count: number; shared_ips: string[] }[]
  >([]);
  const [appeals, setAppeals] = useState<
    { id: number; appellant: string; action: string; text: string }[]
  >([]);
  const [problemId, setProblemId] = useState('');
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiFetch<FlagRow[]>('/integrity/flags/')
      .then(setFlags)
      .catch(() => setFlags(null));
    apiFetch<{
      items: QueueRow[];
      open_count: number;
      sla_breached_count: number;
      sla_hours: number;
    }>('/integrity/abuse-queue/')
      .then(setQueue)
      .catch(() => setQueue(null));
    apiFetch<{ clusters: { usernames: string[]; shared_count: number; shared_ips: string[] }[] }>(
      '/integrity/multi-accounts/',
    )
      .then((data) => setClusters(data.clusters))
      .catch(() => setClusters([]));
    apiFetch<{ id: number; appellant: string; action: string; text: string }[]>(
      '/integrity/appeals/',
    )
      .then(setAppeals)
      .catch(() => setAppeals([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const scan = async () => {
    const id = problemId.trim();
    if (!id || busy) return;
    setBusy(true);
    setScanResult(null);
    try {
      const data = await apiFetch<{ flags_created: Record<string, number> }>('/integrity/scan/', {
        method: 'POST',
        body: JSON.stringify({ problem: Number(id) }),
      });
      setScanResult(
        t('scan_done', '+{{p}} plagiarism, +{{b}} boilerplate', {
          p: data.flags_created.plagiarism,
          b: data.flags_created.boilerplate,
        }),
      );
      load();
    } catch {
      setScanResult(t('scan_failed', 'Scan failed.'));
    } finally {
      setBusy(false);
    }
  };

  const review = async (flagId: number, decision: 'confirmed' | 'dismissed') => {
    try {
      await apiFetch(`/integrity/flags/${flagId}/review/`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      load();
    } catch {
      /* surfaced by the refresh */
    }
  };

  const decide = async (appealId: number, decision: 'accepted' | 'rejected') => {
    try {
      await apiFetch(`/integrity/appeals/${appealId}/decide/`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      load();
    } catch {
      /* surfaced by the refresh */
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'queue', label: t('integ_tab_queue', 'Abuse queue') },
    { id: 'flags', label: t('integ_tab_flags', 'Similarity') },
    { id: 'accounts', label: t('integ_tab_accounts', 'Multi-accounts') },
    { id: 'appeals', label: t('integ_tab_appeals', 'Appeals') },
  ];

  return (
    <div className="card" style={{ marginTop: '1.5rem' }} data-testid="integrity-panel">
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`chip ${tab === id ? 'nav-link--active' : ''}`}
            onClick={() => setTab(id)}
            data-testid={`integ-tab-${id}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'queue' && (
        <div data-testid="integ-queue">
          {!queue ? (
            <p style={{ color: 'var(--muted)' }}>{t('integ_empty', 'Nothing queued.')}</p>
          ) : (
            <>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                {t('queue_summary', '{{open}} open · {{breached}} past the {{hours}}h SLA', {
                  open: queue.open_count,
                  breached: queue.sla_breached_count,
                  hours: queue.sla_hours,
                })}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>{t('queue_kind', 'Kind')}</th>
                    <th>{t('queue_id', 'ID')}</th>
                    <th>{t('queue_age', 'Age (h)')}</th>
                    <th>{t('queue_sla', 'SLA')}</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.items.slice(0, 25).map((row) => (
                    <tr key={`${row.kind}-${row.id}`}>
                      <td>{row.kind}</td>
                      <td>{row.id}</td>
                      <td>{row.age_hours}</td>
                      <td style={{ color: row.sla_breached ? 'var(--danger)' : 'var(--muted)' }}>
                        {row.sla_breached
                          ? t('queue_breached', 'breached')
                          : `${row.sla_due_in_hours}h`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {tab === 'flags' && (
        <div data-testid="integ-flags">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '0.75rem' }}>
            <input
              value={problemId}
              onChange={(e) => setProblemId(e.target.value)}
              placeholder={t('scan_problem_placeholder', 'Problem id…')}
              aria-label={t('scan_problem_placeholder', 'Problem id…')}
              data-testid="scan-problem-input"
              style={{ maxWidth: 140 }}
            />
            <button type="button" className="btn" onClick={scan} disabled={busy}>
              {t('scan_run', 'Scan')}
            </button>
            {scanResult && <span style={{ color: 'var(--accent)' }}>{scanResult}</span>}
          </div>
          {!flags ? (
            <p style={{ color: 'var(--muted)' }}>{t('integ_empty', 'Nothing queued.')}</p>
          ) : flags.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>{t('integ_no_flags', 'No flags.')}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t('flag_kind', 'Kind')}</th>
                  <th>{t('flag_pair', 'Pair')}</th>
                  <th>{t('flag_score', 'Score')}</th>
                  <th>{t('flag_actions', 'Review')}</th>
                </tr>
              </thead>
              <tbody>
                {flags.slice(0, 25).map((row) => (
                  <tr key={row.id}>
                    <td>{row.kind}</td>
                    <td>
                      #{row.submission.id} ({row.submission.user})
                      {row.other ? ` ↔ #${row.other.id} (${row.other.user})` : ' ↔ template'}
                    </td>
                    <td>{row.score.toFixed(2)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--danger"
                        style={{ fontSize: '0.7rem', marginRight: 6 }}
                        onClick={() => review(row.id, 'confirmed')}
                      >
                        {t('flag_confirm', 'Confirm')}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        style={{ fontSize: '0.7rem' }}
                        onClick={() => review(row.id, 'dismissed')}
                      >
                        {t('flag_dismiss', 'Dismiss')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'accounts' && (
        <div data-testid="integ-accounts">
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            {t(
              'accounts_hint',
              'Advisory shared-IP clusters — a school NAT looks identical to a farm; nothing auto-punishes.',
            )}
          </p>
          {clusters.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>{t('integ_empty', 'Nothing queued.')}</p>
          ) : (
            <ul style={{ fontSize: '0.85rem', color: 'var(--body)' }}>
              {clusters.map((row) => (
                <li key={row.usernames.join('-')}>
                  {row.usernames.join(' ↔ ')} — {row.shared_count}{' '}
                  {t('accounts_shared_ips', 'shared IPs')}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'appeals' && (
        <div data-testid="integ-appeals">
          {appeals.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>{t('integ_empty', 'Nothing queued.')}</p>
          ) : (
            appeals.map((row) => (
              <div
                key={row.id}
                style={{
                  borderTop: '1px solid var(--border)',
                  paddingTop: '0.75rem',
                  marginTop: '0.75rem',
                }}
              >
                <strong style={{ fontSize: '0.85rem' }}>
                  {row.appellant} — {row.action}
                </strong>
                <p style={{ fontSize: '0.85rem', color: 'var(--body)' }}>{row.text}</p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn btn--primary"
                    style={{ fontSize: '0.7rem' }}
                    onClick={() => decide(row.id, 'accepted')}
                  >
                    {t('appeal_accept', 'Accept')}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: '0.7rem' }}
                    onClick={() => decide(row.id, 'rejected')}
                  >
                    {t('appeal_reject', 'Reject')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
