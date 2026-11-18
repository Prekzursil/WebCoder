'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { CommunityService } from '@/services/ApiService';
import { WikiListRow } from '@/types/api';
import { palette } from '@/theme/tokens';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';

/**
 * Item 63 — the RO-first algorithm wiki hub: every page, RO title with the
 * EN mirror, linking into the editable article view.
 */
export default function WikiHubPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<WikiListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    CommunityService.getWikiList()
      .then((data) => setRows(data.results))
      .catch((err) => setError(err instanceof Error ? err.message : 'error'));
  }, []);

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader
        title={t('wiki_title', 'Algorithm wiki')}
        subtitle={t(
          'wiki_subtitle',
          'RO-first articles every member can edit — with full history.',
        )}
      />
      {error && (
        <p role="alert" style={{ color: palette.danger }}>
          {error}
        </p>
      )}
      {rows === null ? (
        <p aria-busy="true">{t('wiki_loading', 'Loading pages…')}</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('wiki_empty', 'The wiki is empty')}
          description={t('wiki_empty_hint', 'Create the first article by editing /wiki/<slug>.')}
        />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
          {rows.map((page) => (
            <li
              key={page.slug}
              data-testid={`wiki-hub-${page.slug}`}
              style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: 12 }}
            >
              <Link href={`/wiki/${page.slug}`} style={{ fontWeight: 700, color: palette.accent }}>
                {page.title_ro}
              </Link>
              {page.title_en ? (
                <span style={{ color: palette.muted }}> — {page.title_en}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
