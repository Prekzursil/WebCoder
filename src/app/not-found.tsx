// Ported from frontend/webcoder_ui/src/pages/NotFoundPage.tsx (CRA reference) —
// the `*` catch-all route (App.tsx:46), mapped to the App Router's built-in
// not-found.tsx so unmatched URLs render a real 404.
//
// [SPEC-GAPS A14] Restyled to the card language (surface, border, radius-12):
// big 404, one-line explanation, primary "Browse Problems" / secondary
// "Go Home" actions, and quick links mirroring the problem-detail Quick Links
// block — the old bare h2+p was a dead end.

import Link from 'next/link';
import { createTranslator, getLocale } from './_lib/public-i18n';

export default async function NotFoundPage() {
  const t = createTranslator(await getLocale());

  return (
    <div className="page-container">
      <div
        style={{
          maxWidth: '560px',
          margin: '3rem auto 0',
          padding: '3rem 2rem',
          textAlign: 'center',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            fontSize: '3.5rem',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            background: 'var(--brand-gradient)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            marginBottom: '1rem',
          }}
        >
          {t('not_found_code', '404')}
        </div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: '0.5rem' }}>
          {t('not_found_default_header', '404 - Page Not Found')}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
          {t(
            'not_found_default_message',
            'The page you are looking for does not exist or you may not have permission to view it.'
          )}
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/problems" className="btn btn--primary">
            {t('not_found_browse_problems', 'Browse Problems')}
          </Link>
          <Link href="/" className="btn">
            {t('not_found_go_home', 'Go Home')}
          </Link>
        </div>

        <div
          style={{
            marginTop: '2rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          {[
            { href: '/leaderboard', label: t('quick_link_leaderboard', 'Leaderboard') },
            { href: '/forum', label: t('quick_link_forum', 'Community Forum') },
            { href: '/my-submissions', label: t('quick_link_my_submissions', 'My Submissions') },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="chip"
              style={{ textTransform: 'none' }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
