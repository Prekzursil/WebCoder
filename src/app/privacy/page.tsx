// [roadmap LEG-1 / round-2 X5] Privacy policy — mirrors what the platform
// actually does: cookie-session auth, GDPR export/erase endpoints,
// cookie-light analytics (no third-party trackers), and the minors'
// consent posture (round-2 LEG-2: <16 needs parental/school mediation).

import type { Metadata } from 'next';
import { createTranslator, getLocale } from '../_lib/public-i18n';

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getLocale());
  return { title: t('privacy_title', 'Privacy Policy') };
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);

  const sections: { key: string; title: string; body: string }[] = [
    {
      key: 'what',
      title: t('privacy_what_title', 'What we store'),
      body: t(
        'privacy_what_body',
        'Your account data (username, email, role), your submissions and their judge results, forum posts and votes, problem ratings and scratch runs. Everything is stored on our own infrastructure; we run no third-party analytics or advertising trackers.'
      ),
    },
    {
      key: 'cookies',
      title: t('privacy_cookies_title', 'Cookies'),
      body: t(
        'privacy_cookies_body',
        'One session cookie pair (httpOnly access + refresh tokens) keeps you signed in — it is not readable by page scripts and expires with your session. There is no tracking cookie, ad cookie or social pixel.'
      ),
    },
    {
      key: 'rights',
      title: t('privacy_rights_title', 'Your rights'),
      body: t(
        'privacy_rights_body',
        'From your profile you can export all of your data as a downloadable JSON file, or delete your account: deletion deactivates it immediately, anonymizes your identity, and purges personal side content within 30 days. Judge history (verdicts and standings) is retained in anonymized form for the integrity of the public record.'
      ),
    },
    {
      key: 'minors',
      title: t('privacy_minors_title', 'Minors'),
      body: t(
        'privacy_minors_body',
        'Self-serve accounts require the information-society consent age (16 in Romania). Younger students join through school-mediated classroom enrollment under the school\'s lawful basis, with profiles non-public by default.'
      ),
    },
  ];

  return (
    <div className="page-container" style={{ paddingTop: '2.5rem', maxWidth: '760px' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--foreground)' }}>
        {t('privacy_title', 'Privacy Policy')}
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0.5rem 0 2rem' }}>
        {t('privacy_updated', 'Version 1.0 — updated October 2026')}
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
