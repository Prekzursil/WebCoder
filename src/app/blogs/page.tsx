'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { CommunityService } from '@/services/ApiService';
import { BlogPostRow } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { palette } from '@/theme/tokens';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';

/**
 * Item 62 — the blogs hub: published posts from everyone, a filter by
 * author, and the signed-in write form (draft or publish immediately).
 */
export default function BlogsPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [rows, setRows] = useState<BlogPostRow[] | null>(null);
  const [authorFilter, setAuthorFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [lang, setLang] = useState('en');
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const response = await CommunityService.getBlogs({
        author: authorFilter || undefined,
      });
      setRows(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    }
  }, [authorFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      await CommunityService.createBlogPost({
        title: title.trim(),
        body: body,
        lang,
        status: publish ? 'PUBLISHED' : 'DRAFT',
      });
      setTitle('');
      setBody('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader
        title={t('blogs_title', 'Blogs')}
        subtitle={t('blogs_subtitle', 'Community write-ups, stories and tutorials.')}
      />
      {auth.isAuthenticated && (
        <section
          style={{
            border: `1px solid ${palette.border}`,
            borderRadius: 12,
            padding: 14,
            marginBottom: 18,
          }}
          data-testid="blog-editor"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('blogs_title_placeholder', 'Post title')}
            aria-label={t('blogs_title_placeholder', 'Post title')}
            style={{ width: '100%', padding: '8px 10px', marginBottom: 8 }}
            data-testid="blog-title-input"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('blogs_body_placeholder', 'Write in markdown…')}
            aria-label={t('blogs_body_placeholder', 'Write in markdown…')}
            rows={6}
            style={{ width: '100%', padding: 8, marginBottom: 8 }}
            data-testid="blog-body-input"
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              aria-label={t('blogs_lang', 'Language')}
              data-testid="blog-lang-select"
            >
              <option value="en">EN</option>
              <option value="ro">RO</option>
            </select>
            <label style={{ fontSize: '0.85rem', color: palette.muted }}>
              <input
                type="checkbox"
                checked={publish}
                onChange={(e) => setPublish(e.target.checked)}
              />{' '}
              {t('blogs_publish_now', 'Publish immediately')}
            </label>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !title.trim() || !body.trim()}
              data-testid="blog-submit"
            >
              {busy ? t('posting', 'Posting…') : t('blogs_save', 'Save post')}
            </button>
          </div>
        </section>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={authorFilter}
          onChange={(e) => setAuthorFilter(e.target.value)}
          placeholder={t('blogs_filter_author', 'Filter by author')}
          aria-label={t('blogs_filter_author', 'Filter by author')}
          style={{ padding: '6px 10px' }}
          data-testid="blog-author-filter"
        />
      </div>

      {error && (
        <p role="alert" style={{ color: palette.danger }}>
          {error}
        </p>
      )}
      {rows === null ? (
        <p aria-busy="true">{t('blogs_loading', 'Loading posts…')}</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('blogs_empty', 'No posts yet')}
          description={t(
            'blogs_empty_hint',
            'Be the first to write about how you cracked a problem.',
          )}
        />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
          {rows.map((post) => (
            <li
              key={post.id}
              data-testid={`blog-post-${post.slug}`}
              style={{ border: `1px solid ${palette.border}`, borderRadius: 12, padding: 14 }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '1.05rem' }}>{post.title}</strong>
                <span style={{ color: palette.muted, fontSize: '0.8rem' }}>
                  {post.author_username} · {post.lang.toUpperCase()} ·{' '}
                  {new Date(post.created_at).toLocaleDateString()}
                  {post.status === 'DRAFT' ? ` · ${t('blogs_draft', 'draft')}` : ''}
                </span>
                {auth.user?.username === post.author_username && (
                  <button
                    type="button"
                    style={{ marginLeft: 'auto', fontSize: '0.8rem' }}
                    onClick={async () => {
                      await CommunityService.deleteBlogPost(post.slug);
                      await load();
                    }}
                    data-testid={`blog-delete-${post.slug}`}
                  >
                    {t('delete', 'Delete')}
                  </button>
                )}
              </div>
              <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>
                {post.body.length > 400 ? `${post.body.slice(0, 400)}…` : post.body}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p style={{ marginTop: 16 }}>
        <Link href="/" style={{ color: palette.accent }}>
          ← {t('back_home', 'Home')}
        </Link>
      </p>
    </main>
  );
}
