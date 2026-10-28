'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { CommunityService } from '@/services/ApiService';
import { ArticleRow } from '@/types/api';
import { palette } from '@/theme/tokens';
import EmptyState from '@/components/common/EmptyState';
import PageHeader from '@/components/common/PageHeader';

/** EDT-6 — the article hub (approved lecture notes, tag filterable). */
export default function ArticlesPage() {
    const { t, i18n } = useTranslation();
    const lang = i18n.language === 'ro' ? 'ro' : 'en';
    const [articles, setArticles] = useState<ArticleRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tag, setTag] = useState('');

    const load = useCallback(async () => {
        try {
            const data = await CommunityService.getArticles({ tag: tag || undefined });
            setArticles(data.results);
        } catch (err) {
            setError(
                err instanceof Error && err.message
                    ? err.message
                    : t('articles_load_error', 'Failed to load articles.')
            );
        }
    }, [tag, t]);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
            <PageHeader
                title={t('articles_title', 'Articles & lectures')}
                subtitle={t(
                    'articles_subtitle',
                    'Community algorithm notes, cross-linked from problems by shared tags. Text licensed CC BY-SA 4.0.'
                )}
            />
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    load();
                }}
                style={{ display: 'flex', gap: 8, marginBottom: 16 }}
            >
                <input
                    aria-label={t('articles_tag_filter', 'Filter by tag')}
                    value={tag}
                    onChange={(event) => setTag(event.target.value)}
                    placeholder="hashing"
                    style={{
                        padding: 8,
                        borderRadius: 8,
                        border: `1px solid ${palette.border}`,
                        background: 'transparent',
                        color: palette.foreground,
                    }}
                />
                <button type="submit">{t('filter', 'Filter')}</button>
            </form>
            {error && (
                <div role="alert" style={{ color: palette.danger }}>
                    {error}
                </div>
            )}
            {articles === null ? (
                <p aria-busy="true">{t('articles_loading', 'Loading articles…')}</p>
            ) : articles.length === 0 ? (
                <EmptyState
                    title={t('articles_empty', 'No articles yet')}
                    description={t(
                        'articles_empty_hint',
                        'Creators and teachers publish lecture notes; they appear after review.'
                    )}
                />
            ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {articles.map((article) => (
                        <li
                            key={article.id}
                            style={{
                                borderTop: `1px solid ${palette.border}`,
                                padding: '12px 0',
                            }}
                            data-testid={`article-row-${article.id}`}
                        >
                            <Link
                                href={`/articles/${article.id}`}
                                style={{ color: palette.accent, fontWeight: 600 }}
                            >
                                {String(
                                    article.title_i18n[lang] ?? article.title_i18n.en ?? ''
                                )}
                            </Link>
                            <div style={{ color: palette.muted, fontSize: '0.85rem' }}>
                                {article.author_username} ·{' '}
                                {article.tags.map((tagRow) => tagRow.slug).join(', ')} ·{' '}
                                CC BY-SA 4.0
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
