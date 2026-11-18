'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { CommunityService } from '@/services/ApiService';
import { WikiPageRow, WikiRevisionRow } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { palette } from '@/theme/tokens';
import PageHeader from '@/components/common/PageHeader';

/**
 * Item 63 — one wiki article: the RO-first body with its EN mirror, the
 * member edit form (every save snapshots a revision) and the history feed.
 */
export default function WikiArticlePage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const params = useParams<{ slug: string }>();
  const slug = String(params?.slug ?? '');
  const [page, setPage] = useState<WikiPageRow | null>(null);
  const [history, setHistory] = useState<WikiRevisionRow[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [titleRo, setTitleRo] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [bodyRo, setBodyRo] = useState('');
  const [bodyEn, setBodyEn] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await CommunityService.getWikiPage(slug);
      setPage(data);
      setTitleRo(data.title_ro);
      setTitleEn(data.title_en);
      setBodyRo(data.body_ro);
      setBodyEn(data.body_en);
      setNotFound(false);
    } catch {
      setNotFound(true);
    }
    CommunityService.getWikiHistory(slug)
      .then((data) => setHistory(data.results))
      .catch(() => setHistory([]));
  }, [slug]);

  useEffect(() => {
    if (slug) load();
  }, [load, slug]);

  const save = async () => {
    setBusy(true);
    try {
      await CommunityService.saveWikiPage(slug, {
        title_ro: titleRo,
        title_en: titleEn,
        body_ro: bodyRo,
        body_en: bodyEn,
        note,
      });
      setEditing(false);
      setNote('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader
        title={page ? page.title_ro : `wiki:${slug}`}
        subtitle={
          page
            ? `${t('wiki_last_edited_by', 'Last edited by')} ${
                page.updated_by_username ?? '—'
              } · ${new Date(page.updated_at).toLocaleString()}`
            : t('wiki_new_page', 'New wiki page')
        }
      />
      <p>
        <Link href="/wiki" style={{ color: palette.accent }}>
          ← {t('wiki_back', 'All articles')}
        </Link>
      </p>
      {error && (
        <p role="alert" style={{ color: palette.danger }}>
          {error}
        </p>
      )}
      {notFound && !editing && (
        <p style={{ color: palette.muted }} data-testid="wiki-missing">
          {t('wiki_missing', 'This page does not exist yet — create it with Edit.')}
        </p>
      )}

      {page && !editing && (
        <article data-testid="wiki-body">
          <h4>Română</h4>
          <p style={{ whiteSpace: 'pre-wrap' }}>{page.body_ro}</p>
          {page.body_en ? (
            <>
              <h4>English</h4>
              <p style={{ whiteSpace: 'pre-wrap' }}>{page.body_en}</p>
            </>
          ) : null}
        </article>
      )}

      {auth.isAuthenticated && !editing && (
        <button type="button" onClick={() => setEditing(true)} data-testid="wiki-edit-button">
          {notFound ? t('wiki_create', 'Create this page') : t('wiki_edit', 'Edit')}
        </button>
      )}

      {editing && (
        <section data-testid="wiki-editor" style={{ marginTop: 12 }}>
          <label style={{ display: 'block', fontWeight: 600 }}>
            {t('wiki_title_ro', 'Title (RO)')}
          </label>
          <input
            value={titleRo}
            onChange={(e) => setTitleRo(e.target.value)}
            data-testid="wiki-title-ro"
            style={{ width: '100%', padding: 8, marginBottom: 8 }}
          />
          <label style={{ display: 'block', fontWeight: 600 }}>
            {t('wiki_body_ro', 'Body (RO, markdown)')}
          </label>
          <textarea
            value={bodyRo}
            onChange={(e) => setBodyRo(e.target.value)}
            rows={8}
            data-testid="wiki-body-ro"
            style={{ width: '100%', padding: 8, marginBottom: 8 }}
          />
          <label style={{ display: 'block', fontWeight: 600 }}>
            {t('wiki_title_en', 'Title (EN)')}
          </label>
          <input
            value={titleEn}
            onChange={(e) => setTitleEn(e.target.value)}
            data-testid="wiki-title-en"
            style={{ width: '100%', padding: 8, marginBottom: 8 }}
          />
          <label style={{ display: 'block', fontWeight: 600 }}>
            {t('wiki_body_en', 'Body (EN, markdown)')}
          </label>
          <textarea
            value={bodyEn}
            onChange={(e) => setBodyEn(e.target.value)}
            rows={8}
            data-testid="wiki-body-en"
            style={{ width: '100%', padding: 8, marginBottom: 8 }}
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('wiki_note', 'Change note')}
            aria-label={t('wiki_note', 'Change note')}
            style={{ width: '100%', padding: 8, marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={save}
              disabled={busy || !titleRo.trim() || !bodyRo.trim()}
              data-testid="wiki-save"
            >
              {busy ? t('saving', 'Saving…') : t('save', 'Save')}
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              {t('cancel', 'Cancel')}
            </button>
          </div>
        </section>
      )}

      {history && history.length > 0 && (
        <section style={{ marginTop: 18 }}>
          <h4>{t('wiki_history_title', 'History')}</h4>
          <ul style={{ listStyle: 'none', padding: 0, fontSize: '0.85rem', color: palette.muted }}>
            {history.map((revision) => (
              <li key={revision.id} data-testid={`wiki-revision-${revision.id}`}>
                {new Date(revision.created_at).toLocaleString()} · {revision.editor ?? '—'}{' '}
                {revision.note ? `— ${revision.note}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
