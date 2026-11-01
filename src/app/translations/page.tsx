'use client';

// Community-translation curation surface (i18n wave, owner rule (c)).
//
// Two tabs over the same proposal API: the VERIFIER/ADMIN queue (filter,
// approve / reject-with-note — approval promotes atomically into the
// problem, so the next page view of that language is the translation) and
// the contributor's "mine" list with each decision and reviewer note.
// The AI-curator pre-screening columns render whenever the backend
// screened a proposal (verdict / confidence / one-line notes).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { TranslationsService } from '@/services/ApiService';
import type { TranslationProposalRow } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { palette, hexAlpha } from '@/theme/tokens';
import EmptyState from '@/components/common/EmptyState';
import PageHeader from '@/components/common/PageHeader';

/** Verifiers + admins curate; matches the backend IsProblemVerifier cohort. */
function isVerifier(role?: string): boolean {
  return role === 'ADMIN' || role === 'VERIFIER'
    || role === 'PROBLEM_VERIFIER';
}

const CARD: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '1.25rem 1.5rem',
  marginBottom: '0.75rem',
};

const CHIP: React.CSSProperties = {
  padding: '1px 9px',
  borderRadius: '999px',
  fontSize: '0.7rem',
  fontWeight: 700,
  display: 'inline-block',
};

const FIELD: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: '0.85rem',
};

type Tab = 'queue' | 'mine';

function statusChip(t: ReturnType<typeof useTranslation>['t'], row: TranslationProposalRow) {
  const styles: Record<string, React.CSSProperties> = {
    PENDING: { color: palette.warn, background: hexAlpha(palette.warn, 0.12) },
    APPROVED: { color: palette.success, background: hexAlpha(palette.success, 0.12) },
    REJECTED: { color: palette.danger, background: hexAlpha(palette.danger, 0.12) },
  };
  const label = row.status === 'PENDING'
    ? t('translations_status_pending', 'Pending')
    : row.status === 'APPROVED'
      ? t('translations_status_approved', 'Approved')
      : t('translations_status_rejected', 'Rejected');
  return (
    <span style={{ ...CHIP, ...styles[row.status] }} data-testid={`proposal-status-${row.id}`}>
      {label}
    </span>
  );
}

function aiChip(t: ReturnType<typeof useTranslation>['t'], row: TranslationProposalRow) {
  if (!row.ai_verdict) {
    return <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{t('translations_ai_none', 'not screened')}</span>;
  }
  const map: Record<string, { label: string; color: string }> = {
    approve: { label: t('translations_ai_approve', 'AI: looks good'), color: palette.success },
    flag: { label: t('translations_ai_flag', 'AI: needs a human'), color: palette.warn },
    error: { label: t('translations_ai_error', 'AI: unavailable (human review)'), color: palette.danger },
  };
  const entry = map[row.ai_verdict] ?? map.error;
  return (
    <span
      title={row.ai_notes || undefined}
      style={{ ...CHIP, color: entry.color, background: hexAlpha(palette.muted, 0.1) }}
    >
      {entry.label}
      {row.ai_confidence !== null ? ` · ${t('translations_confidence', 'confidence {{n}}', { n: row.ai_confidence.toFixed(2) })}` : ''}
    </span>
  );
}

function ProposalCard({
  row,
  mode,
  onDecide,
  busy,
  note,
  setNote,
}: {
  row: TranslationProposalRow;
  mode: 'queue' | 'mine';
  onDecide: (id: number, decision: 'approve' | 'reject') => void;
  busy: number | null;
  note: string;
  setNote: (id: number, note: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <article style={CARD} data-testid={`proposal-row-${row.id}`}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <Link href={`/problems/${row.problem_id}`} style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.95rem' }}>
          #{row.problem_id} · {row.problem_title_en}
        </Link>
        <span style={{ ...CHIP, color: palette.violet, background: hexAlpha(palette.violet, 0.1), fontFamily: 'var(--font-mono)' }}>
          {row.language}
        </span>
        {statusChip(t, row)}
        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
          {mode === 'queue'
            ? `${t('translations_contributor', 'Contributor')}: @${row.contributor_username}`
            : new Date(row.created_at).toLocaleDateString()}
        </span>
      </div>
      <p style={{ margin: '0 0 0.35rem', fontWeight: 700, fontSize: '0.9rem' }}>{row.title}</p>
      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)', whiteSpace: 'pre-wrap', maxHeight: '6rem', overflow: 'hidden' }}>
        {row.statement}
      </p>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.6rem' }}>
        {aiChip(t, row)}
      </div>
      {row.status === 'REJECTED' && row.review_note && (
        <p style={{ margin: '0.6rem 0 0', fontSize: '0.8rem', color: palette.danger }}>
          {t('verifier_feedback_label', 'Feedback')}: {row.review_note}
        </p>
      )}
      {mode === 'queue' && row.status === 'PENDING' && (
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid var(--border)' }}>
          <input
            type="text"
            placeholder={t('translations_reject_note_label', 'Note to the contributor (shown on rejection)')}
            value={note}
            onChange={(event) => setNote(row.id, event.target.value)}
            style={{ ...FIELD, flex: '1 1 220px' }}
            aria-label={t('translations_reject_note_label', 'Note to the contributor (shown on rejection)')}
            data-testid="reject-note-input"
          />
          <button
            type="button"
            className="btn"
            disabled={busy === row.id}
            onClick={() => onDecide(row.id, 'approve')}
            data-testid="approve-btn"
          >
            {t('translations_approve', 'Approve')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy === row.id}
            onClick={() => onDecide(row.id, 'reject')}
            style={{ color: palette.danger, borderColor: palette.danger }}
            data-testid="reject-btn"
          >
            {t('translations_reject', 'Reject')}
          </button>
        </div>
      )}
    </article>
  );
}

export default function TranslationsPage() {
  const { t } = useTranslation();
  const { user, isHydrated } = useAuth();
  const verifier = isVerifier(user?.role);

  const [tab, setTab] = useState<Tab>('queue');
  const [rows, setRows] = useState<TranslationProposalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [decided, setDecided] = useState<'ok' | 'error' | null>(null);

  useEffect(() => {
    if (isHydrated) setTab(verifier ? 'queue' : 'mine');
  }, [isHydrated, verifier]);

  const load = useCallback(() => {
    setLoading(true);
    const fetcher = tab === 'queue' && verifier
      ? TranslationsService.getProposals({ status: statusFilter || undefined, pageSize: 50 })
      : TranslationsService.getMine({ pageSize: 50 });
    fetcher
      .then((response) => {
        setRows(response.results);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [tab, verifier, statusFilter]);

  useEffect(() => {
    if (isHydrated && (tab === 'mine' ? user : true)) load();
    else if (isHydrated) setLoading(false);
  }, [isHydrated, user, load, tab]);

  const onDecide = async (id: number, decision: 'approve' | 'reject') => {
    setBusy(id);
    setDecided(null);
    try {
      if (decision === 'approve') {
        await TranslationsService.approve(id);
      } else {
        await TranslationsService.reject(id, notes[id] ?? '');
      }
      setDecided('ok');
      load();
    } catch {
      setDecided('error');
    } finally {
      setBusy(null);
    }
  };

  if (!isHydrated) {
    return (
      <main className="page-container">
        <p role="status">{t('loading', 'Loading…')}</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page-container">
        <PageHeader title={t('translations_queue_header', 'Translation queue')} />
        <EmptyState
          title={t('translations_queue_login', 'Log in as a verifier to curate translations.')}
          description={t('translate_login_hint', 'Log in to propose a translation.')}
          action={<Link href="/login" className="btn">{t('login_button', 'Login')}</Link>}
        />
      </main>
    );
  }

  const tabButton = (which: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(which)}
      aria-current={tab === which}
      className="btn"
      style={tab === which ? undefined : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
    >
      {label}
    </button>
  );

  return (
    <main className="page-container">
      <PageHeader
        title={tab === 'queue' && verifier
          ? t('translations_queue_header', 'Translation queue')
          : t('translations_my_header', 'My translations')}
        subtitle={tab === 'queue' && verifier
          ? t(
              'translations_queue_subtitle',
              'Community translation proposals, newest first. Approving publishes the translation with attribution on the problem page.'
            )
          : t('translations_my_hint', 'Propose a translation from any problem page ("Help translate") and follow its decision here.')}
        action={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {verifier && tabButton('queue', t('translations_queue_header', 'Translation queue'))}
            {tabButton('mine', t('translations_my_header', 'My translations'))}
          </div>
        }
      />

      {tab === 'queue' && verifier && (
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="translation-status-filter" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--muted)', marginRight: '0.5rem' }}>
            {t('translations_filter_status', 'Status')}
          </label>
          <select
            id="translation-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={FIELD}
          >
            <option value="PENDING">{t('translations_status_pending', 'Pending')}</option>
            <option value="APPROVED">{t('translations_status_approved', 'Approved')}</option>
            <option value="REJECTED">{t('translations_status_rejected', 'Rejected')}</option>
            <option value="">{t('filter_all', 'All')}</option>
          </select>
        </div>
      )}

      {tab === 'queue' && !verifier && (
        <div style={CARD} role="note">
          <p style={{ margin: 0 }}>{t('translations_forbidden', 'Only verifiers and admins can curate translations.')}</p>
        </div>
      )}

      {decided === 'ok' && (
        <p role="status" style={{ color: palette.success, fontWeight: 700 }} data-testid="decided-ok">
          {t('translations_decided_ok', 'Decision saved.')}
        </p>
      )}
      {decided === 'error' && (
        <p role="alert" style={{ color: palette.danger, fontWeight: 700 }}>
          {t('translations_decided_error', 'Could not save the decision.')}
        </p>
      )}

      {tab === 'queue' && verifier && loading ? (
        <p role="status">{t('loading', 'Loading…')}</p>
      ) : error ? (
        <p role="alert" style={{ color: palette.danger }}>
          {t('translations_load_error', 'Failed to load translation proposals.')}
        </p>
      ) : rows.length === 0 ? (
        tab === 'queue' ? (
          <EmptyState
            title={t('translations_queue_empty', 'No pending translation proposals.')}
          />
        ) : (
          <EmptyState
            title={t('translations_my_empty', 'You have not proposed any translations yet.')}
            description={t('translations_my_hint', 'Propose a translation from any problem page ("Help translate") and follow its decision here.')}
          />
        )
      ) : (
        rows.map((row) => (
          <ProposalCard
            key={row.id}
            row={row}
            mode={tab === 'queue' && verifier ? 'queue' : 'mine'}
            onDecide={onDecide}
            busy={busy}
            note={notes[row.id] ?? ''}
            setNote={(id, note) => setNotes((prev) => ({ ...prev, [id]: note }))}
          />
        ))
      )}
    </main>
  );
}
