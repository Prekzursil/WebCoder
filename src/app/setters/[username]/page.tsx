'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { CommunityService } from '@/services/ApiService';
import { SetterCV } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { palette } from '@/theme/tokens';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';

/**
 * Item 70 — the public setter CV: the derived authoring portfolio plus
 * the owner-editable blurb and links.
 */
export default function SetterCvPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const params = useParams<{ username: string }>();
  const username = String(params?.username ?? '');
  const [cv, setCv] = useState<SetterCV | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [blurb, setBlurb] = useState('');
  const [links, setLinks] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await CommunityService.getSetterCV(username);
      setCv(data);
      setBlurb(data.blurb);
      setLinks(data.links.join('\n'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    }
  }, [username]);

  useEffect(() => {
    if (username) load();
  }, [load, username]);

  const save = async () => {
    setBusy(true);
    try {
      const parsed = links
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      await CommunityService.saveSetterCV(username, { blurb, links: parsed });
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  const isOwner = auth.user?.username === username;

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader
        title={t('setter_cv_title', 'Setter CV — {{user}}', { user: username })}
        subtitle={t(
          'setter_cv_subtitle',
          'The authoring portfolio: problems, editorials, articles.',
        )}
      />
      {error && (
        <p role="alert" style={{ color: palette.danger }}>
          {error}
        </p>
      )}
      {cv === null && !error ? (
        <p aria-busy="true">{t('loading', 'Loading…')}</p>
      ) : cv ? (
        <>
          <div
            data-testid="setter-cv-summary"
            style={{
              border: `1px solid ${palette.border}`,
              borderRadius: 12,
              padding: 14,
              marginBottom: 12,
            }}
          >
            <strong>{cv.problems_approved}</strong> {t('setter_problems', 'approved problems')} ·{' '}
            <strong>{cv.community_editorials}</strong> {t('setter_editorials', 'editorials')} ·{' '}
            <strong>{cv.articles}</strong> {t('setter_articles', 'articles')} ·{' '}
            <strong>{cv.contests_contributed}</strong> {t('setter_contests', 'contests')}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {Object.entries(cv.problems_by_difficulty).map(([level, count]) => (
              <span
                key={level}
                data-testid={`setter-difficulty-${level}`}
                style={{
                  border: `1px solid ${palette.border}`,
                  borderRadius: 999,
                  padding: '2px 10px',
                  fontSize: '0.8rem',
                  color: palette.muted,
                }}
              >
                {level}: {count}
              </span>
            ))}
          </div>
          {cv.blurb && !editing ? (
            <p data-testid="setter-blurb" style={{ maxWidth: 640 }}>
              {cv.blurb}
            </p>
          ) : null}
          {cv.links.length > 0 && !editing ? (
            <ul data-testid="setter-links" style={{ margin: '8px 0' }}>
              {cv.links.map((link) => (
                <li key={link}>
                  <a href={link} target="_blank" rel="noreferrer" style={{ color: palette.accent }}>
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {isOwner && !editing ? (
            <button type="button" onClick={() => setEditing(true)} data-testid="setter-edit-button">
              {t('setter_edit', 'Edit CV')}
            </button>
          ) : null}
          {editing ? (
            <div data-testid="setter-editor" style={{ marginTop: 12 }}>
              <textarea
                value={blurb}
                onChange={(e) => setBlurb(e.target.value)}
                rows={4}
                maxLength={600}
                aria-label={t('setter_blurb_label', 'Blurb')}
                style={{ width: '100%', padding: 8, marginBottom: 8 }}
                data-testid="setter-blurb-input"
              />
              <textarea
                value={links}
                onChange={(e) => setLinks(e.target.value)}
                rows={3}
                aria-label={t('setter_links_label', 'Links (one per line)')}
                placeholder="https://…"
                style={{ width: '100%', padding: 8, marginBottom: 8 }}
                data-testid="setter-links-input"
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={save} disabled={busy} data-testid="setter-save">
                  {t('save', 'Save')}
                </button>
                <button type="button" onClick={() => setEditing(false)}>
                  {t('cancel', 'Cancel')}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState title={t('setter_not_found', 'No such setter')} description={error ?? ''} />
      )}
      <p style={{ marginTop: 16 }}>
        <Link href={`/profile/${username}`} style={{ color: palette.accent }}>
          ← {t('back_to_profile', 'Back to the profile')}
        </Link>
      </p>
    </main>
  );
}
