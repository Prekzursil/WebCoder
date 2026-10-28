'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { CommunityService } from '@/services/ApiService';
import { ArticleRow } from '@/types/api';
import { palette } from '@/theme/tokens';
import PageHeader from '@/components/common/PageHeader';

/** EDT-6 — one lecture note: bilingual body + license line. */
export default function ArticleDetailPage() {
    const params = useParams<{ articleId: string }>();
    const { t, i18n } = useTranslation();
    const lang = i18n.language === 'ro' ? 'ro' : 'en';
    const [article, setArticle] = useState<ArticleRow | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!params?.articleId) return;
        CommunityService.getArticle(params.articleId)
            .then(setArticle)
            .catch(() => setError(t('articles_not_found', 'Article not found.')));
    }, [params?.articleId, t]);

    if (error || !article) {
        return (
            <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
                <div role="alert" style={{ color: palette.danger }}>
                    {error ?? t('articles_loading', 'Loading articles…')}
                </div>
                <Link href="/articles" style={{ color: palette.accent }}>
                    ← {t('articles_back', 'Back to articles')}
                </Link>
            </main>
        );
    }

    const body = lang === 'ro' && article.body_ro ? article.body_ro : article.body_en;
    return (
        <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
            <PageHeader
                title={String(article.title_i18n[lang] ?? article.title_i18n.en ?? '')}
                subtitle={`${article.author_username} · CC BY-SA 4.0`}
            />
            <article data-testid="article-body" style={{ whiteSpace: 'pre-wrap' }}>
                {body}
            </article>
        </main>
    );
}
