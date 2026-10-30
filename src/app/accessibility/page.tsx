// [roadmap OPS-5] Published accessibility statement. We run an axe
// gate in CI on every page (no critical/serious violations) and
// keyboard-complete flows — this page claims that commitment publicly,
// the way no competitor does (the roadmap's research found no judge
// publishing one), and it matters for school procurement.

import type { Metadata } from 'next';
import Link from 'next/link';
import { createTranslator, getLocale } from '../_lib/public-i18n';

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getLocale());
  return { title: t('accessibility_title', 'Accessibility statement') };
}

export default async function AccessibilityPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);

  const commitments: { key: string; body: string }[] = [
    {
      key: 'standard',
      body: t(
        'accessibility_standard',
        'We aim to conform to WCAG 2.1 level AA. Every page in the interface is scanned automatically on each change (the axe-core accessibility gate in our continuous integration), and a change that introduces a critical or serious violation does not ship.'
      ),
    },
    {
      key: 'keyboard',
      body: t(
        'accessibility_keyboard',
        'The whole submission flow — finding a problem, writing code in the editor, submitting and reading the verdict — is operable by keyboard alone. Focus is always visible, and pages expose a skip link to the main content.'
      ),
    },
    {
      key: 'screenreaders',
      body: t(
        'accessibility_screenreaders',
        'Problem pages, standings tables and forms use semantic landmarks, labels and table headers so screen readers can navigate them. Colour is never the only signal: verdicts carry text, and rating colour bands are always accompanied by numbers.'
      ),
    },
    {
      key: 'contrast',
      body: t(
        'accessibility_contrast',
        'The interface palette is tested for contrast at the AA ratio on both light and dark surfaces.'
      ),
    },
    {
      key: 'feedback',
      body: t(
        'accessibility_feedback',
        'If something on WebCoder is hard or impossible for you to use, write to us and we will treat it as a bug: accessibility@webcoder.example. Feedback from teachers and students using assistive technology drives this page.'
      ),
    },
  ];

  return (
    <div className="page-container" style={{ paddingTop: '2.5rem', maxWidth: '760px' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--foreground)' }}>
        {t('accessibility_title', 'Accessibility statement')}
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0.5rem 0 2rem', lineHeight: 1.7 }}>
        {t(
          'accessibility_intro',
          'WebCoder is built for schools and students, so it has to work for everyone. This page states what we commit to and how it is enforced — not an aspiration, a gate in our pipeline.'
        )}
      </p>

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '1rem' }}>
        {commitments.map((item) => (
          <li
            key={item.key}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1rem 1.25rem',
              color: 'var(--muted)',
              fontSize: '0.9rem',
              lineHeight: 1.7,
            }}
          >
            {item.body}
          </li>
        ))}
      </ul>

      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '2rem' }}>
        <Link href="/terms">{t('accessibility_terms_link', 'Terms of use')}</Link>
        {' · '}
        <Link href="/privacy">{t('accessibility_privacy_link', 'Privacy policy')}</Link>
      </p>
    </div>
  );
}
