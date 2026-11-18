'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { CommunityService } from '@/services/ApiService';
import { AmaListRow, ProblemRequestRow, ReputationProfile } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { palette } from '@/theme/tokens';
import EmptyState from '@/components/common/EmptyState';

/**
 * Item 68 — the AMA hub: scheduled/live/closed sessions hosted by
 * Mentor-tier contributors.
 */
export function AmaHub() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AmaListRow[] | null>(null);
  useEffect(() => {
    CommunityService.getAmas()
      .then((data) => setRows(data.results))
      .catch(() => setRows([]));
  }, []);
  return (
    <section data-testid="ama-hub" style={{ marginBottom: 24 }}>
      <h3>{t('ama_title', 'Medalist AMAs')}</h3>
      {rows === null ? (
        <p aria-busy="true">{t('ama_loading', 'Loading sessions…')}</p>
      ) : rows.length === 0 ? (
        <p style={{ color: palette.muted }}>
          {t('ama_empty', 'No sessions yet — Mentor-tier contributors can host one.')}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
          {rows.map((row) => (
            <li key={row.id} data-testid={`ama-row-${row.id}`}>
              <Link href={`/amas/${row.id}`} style={{ fontWeight: 700 }}>
                {row.title}
              </Link>{' '}
              <span
                style={{
                  color:
                    row.status === 'LIVE'
                      ? palette.success
                      : row.status === 'SCHEDULED'
                        ? palette.accent
                        : palette.muted,
                  fontWeight: 700,
                  fontSize: '0.8rem',
                }}
              >
                {row.status}
              </span>
              <span style={{ color: palette.muted, fontSize: '0.85rem' }}>
                {' '}
                · {t('ama_host', 'Host')}: {row.host}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Item 66 — the caller's reputation card (tier, next tier, privileges).
 */
export function ReputationCard() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [profile, setProfile] = useState<ReputationProfile | null>(null);
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    CommunityService.getMyReputation()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [auth.isAuthenticated]);
  if (!auth.isAuthenticated || !profile) return null;
  return (
    <section
      data-testid="reputation-card"
      style={{
        border: `1px solid ${palette.border}`,
        borderRadius: 12,
        padding: 14,
        marginBottom: 24,
      }}
    >
      <strong>
        {t('reputation_title', 'Reputation')}: {profile.tier}
      </strong>
      <span style={{ color: palette.muted, marginLeft: 10 }}>
        {profile.honor} {t('reputation_honor', 'honor')}
      </span>
      {profile.next_tier && (
        <p style={{ color: palette.muted, fontSize: '0.85rem', margin: '6px 0 0' }}>
          {t('reputation_next', '{{needed}} honor to {{tier}}', {
            needed: profile.next_tier.honor_needed,
            tier: profile.next_tier.name,
          })}
        </p>
      )}
      <p style={{ fontSize: '0.8rem', color: palette.muted, margin: '6px 0 0' }}>
        {t('reputation_privileges', 'Privileges')}: {profile.privileges.join(', ')}
      </p>
    </section>
  );
}

/**
 * Item 69 — the problem-request board: open a request, vote, watch triage.
 */
export function ProblemRequestBoard() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [rows, setRows] = useState<ProblemRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    CommunityService.getProblemRequests()
      .then((data) => setRows(data.results))
      .catch((err) => setError(err instanceof Error ? err.message : 'error'));
  };
  useEffect(load, []);

  const open = async () => {
    if (!title.trim() || !description.trim()) return;
    setBusy(true);
    try {
      await CommunityService.createProblemRequest({
        title: title.trim(),
        description: description.trim(),
      });
      setTitle('');
      setDescription('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  const vote = async (requestId: number) => {
    setBusy(true);
    try {
      await CommunityService.voteProblemRequest(requestId);
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="problem-request-board">
      <h3>{t('requests_title', 'Problem requests')}</h3>
      {error && (
        <p role="alert" style={{ color: palette.danger }}>
          {error}
        </p>
      )}
      {auth.isAuthenticated && (
        <div
          style={{
            border: `1px solid ${palette.border}`,
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
          data-testid="request-form"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('requests_title_placeholder', 'What should authors build?')}
            aria-label={t('requests_title_placeholder', 'What should authors build?')}
            style={{ width: '100%', padding: 8, marginBottom: 8 }}
            data-testid="request-title-input"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('requests_description_placeholder', 'Describe the problem or topic…')}
            aria-label={t('requests_description_placeholder', 'Describe the problem or topic…')}
            rows={3}
            style={{ width: '100%', padding: 8, marginBottom: 8 }}
            data-testid="request-description-input"
          />
          <button
            type="button"
            onClick={open}
            disabled={busy || !title.trim() || !description.trim()}
            data-testid="request-submit"
          >
            {t('requests_open', 'Open request')}
          </button>
        </div>
      )}
      {rows === null ? (
        <p aria-busy="true">{t('requests_loading', 'Loading requests…')}</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('requests_empty', 'No requests yet')}
          description={t(
            'requests_empty_hint',
            'Vote for the problems you want to see — authors watch this board.',
          )}
        />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
          {rows.map((row) => (
            <li
              key={row.id}
              data-testid={`request-row-${row.id}`}
              style={{
                border: `1px solid ${palette.border}`,
                borderRadius: 10,
                padding: 12,
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong>{row.title}</strong>
                <span
                  style={{
                    color:
                      row.status === 'FULFILLED'
                        ? palette.success
                        : row.status === 'DECLINED'
                          ? palette.danger
                          : palette.accent,
                    fontWeight: 700,
                    fontSize: '0.8rem',
                  }}
                >
                  {row.status}
                </span>
                {auth.isAuthenticated && (
                  <button
                    type="button"
                    onClick={() => vote(row.id)}
                    disabled={busy}
                    style={{ marginLeft: 'auto' }}
                    data-testid={`request-vote-${row.id}`}
                  >
                    ▲ {row.vote_count}
                  </button>
                )}
              </div>
              <p style={{ margin: '6px 0 0', color: palette.muted }}>{row.description}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
