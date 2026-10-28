// [roadmap LEG-1 / round-2 X5] Terms of service. Bilingual via the
// public-messages dictionary; a plain, honest v1 — the school-facing
// data-processing template and submission-license grant text ride the
// same page and evolve with LEGAL.md review before public exposure.

import type { Metadata } from 'next';
import { createTranslator, getLocale } from '../_lib/public-i18n';

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getLocale());
  return { title: t('terms_title', 'Terms of Service') };
}

export default async function TermsPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);

  const sections: { key: string; title: string; body: string }[] = [
    {
      key: 'accounts',
      title: t('terms_accounts_title', 'Accounts'),
      body: t(
        'terms_accounts_body',
        'You are responsible for your account and its activity. One account per person; sharing accounts or submitting on behalf of someone else is not allowed. Accounts of users under 16 require parental consent or school-mediated enrollment.'
      ),
    },
    {
      key: 'conduct',
      title: t('terms_conduct_title', 'Conduct'),
      body: t(
        'terms_conduct_body',
        'No abuse: attacking the platform, attempting to read other users\' data, or circumventing judge limits. During rated contests, solutions must be your own work — see the contest rules published with each contest.'
      ),
    },
    {
      key: 'schools',
      title: t('terms_schools_title', 'Schools and data processing'),
      body: t('terms_schools_body', 'Schools using classes and teme can request our data-processing agreement template.'),
    },
    {
      key: 'content',
      title: t('terms_content_title', 'Your content'),
      body: t(
        'terms_content_body',
        'Code you submit stays yours; you grant the platform the non-exclusive right to display your submissions (e.g. post-solve solution browsing) and verify them for plagiarism. Editorial and forum text you write is licensed CC BY-SA 4.0 so the community can reuse and translate it with attribution.'
      ),
    },
    {
      key: 'availability',
      title: t('terms_availability_title', 'Availability'),
      body: t(
        'terms_availability_body',
        'The service is provided as-is. We run daily backups and test restores, but we do not guarantee uninterrupted availability; judge results may be re-evaluated if a defect is found.'
      ),
    },
  ];

  return (
    <div className="page-container" style={{ paddingTop: '2.5rem', maxWidth: '760px' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--foreground)' }}>
        {t('terms_title', 'Terms of Service')}
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0.5rem 0 2rem' }}>
        {t('terms_updated', 'Version 1.0 — updated October 2026')}
      </p>
      {sections.map((section) => (
        <section key={section.key} style={{ marginBottom: '1.75rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: '0.5rem' }}>
            {section.title}
          </h2>
          <p style={{ color: 'var(--body)', fontSize: '0.88rem', lineHeight: 1.8, margin: 0 }}>
            {section.body}
          </p>
        </section>
      ))}
    </div>
  );
}
