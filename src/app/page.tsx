// Ported from frontend/webcoder_ui/src/pages/HomePage.tsx (CRA reference)

import type { Metadata } from 'next';
import Link from 'next/link';
import { getProblems } from './problems/_lib/problems-api';
import { createTranslator, getLocale } from './_lib/public-i18n';
import HomeSignUpButton from './HomeSignUpButton';
import ActivityFeed from '@/components/common/ActivityFeed';
import styles from './home.module.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://webcoder.momentstudio.ro';

export const metadata: Metadata = {
  title: 'WebCoder — Competitive Programming Platform',
  description:
    'Sharpen your skills, solve challenging problems, and compete with a community of developers from around the world. WebCoder supports Python 3, C++17, and Java 11.',
  alternates: {
    canonical: siteUrl,
  },
};

// The FAQ lives in the shared dictionary ([Q4]): the visible <details> UI
// and the JSON-LD FAQPage schema are both derived from the same per-locale
// entries, so SSR markup and visible copy can never drift apart.
function buildFaqSchema(t: ReturnType<typeof createTranslator>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: ([1, 2, 3, 4] as const).map((n) => ({
      '@type': 'Question',
      name: t(`faq_q${n}`, ''),
      acceptedAnswer: {
        '@type': 'Answer',
        text: t(`faq_a${n}`, ''),
      },
    })),
  };
}

export default async function HomePage() {
  const t = createTranslator(await getLocale());
  const faqSchema = buildFaqSchema(t);

  // [roadmap UXP-5a] Problem of the day: a deterministic pick over the
  // APPROVED pool — hash(utc date) % count, difficulty-rotating by weekday.
  // Best-effort: no catalog, no strip.
  let dailyProblem: { id: number; title: string; difficulty: string } | null = null;
  try {
    const catalog = await getProblems();
    if (catalog.length > 0) {
      const dayKey = new Date().toISOString().slice(0, 10);
      let hash = 0;
      for (const ch of dayKey) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
      const rotation = ['EASY', 'MEDIUM', 'HARD'];
      const wantDifficulty = rotation[new Date().getUTCDay() % rotation.length];
      const pool = catalog.filter((p) => p.difficulty === wantDifficulty);
      const source = pool.length > 0 ? pool : catalog;
      const pick = source[hash % source.length];
      dailyProblem = {
        id: pick.id,
        title: pick.title_i18n?.en ?? `#${pick.id}`,
        difficulty: pick.difficulty ?? 'MEDIUM',
      };
    }
  } catch {
    // No daily strip without the catalog.
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      {/* [Q11] the app shell in providers.tsx owns the single <main> landmark;
          this page-level wrapper is purely presentational. */}
      <div className={styles.home} aria-label="WebCoder home page">
        <div className={styles.badge} aria-hidden="true">
          {t('home_badge', '✦ Competitive Programming Platform')}
        </div>
        <h1 className={styles.title}>{t('welcome_message', 'Welcome to WebCoder')}</h1>
        <p className={styles.subtitle}>
          {t('homepage_subtitle', 'The ultimate platform for competitive programming.')}
        </p>
        <p className={styles.description}>
          {t(
            'homepage_description',
            'Sharpen your skills, solve challenging problems, and compete with a community of developers from around the world. Whether you are a beginner or an expert, WebCoder has something for you.'
          )}
        </p>
        <div className={styles.actions}>
          <Link href="/problems" className={`${styles.button} ${styles.buttonPrimary}`}>
            {t('view_problems_button', 'View Problems')} →
          </Link>
          <HomeSignUpButton label={t('sign_up_button', 'Sign Up')} />
        </div>
      {dailyProblem && (
        <div className={styles.dailyStrip}>
          <span className={styles.dailyLabel}>{t('daily_problem_label', 'Problem of the day')}</span>
          <a href={`/problems/${dailyProblem.id}`} className={styles.dailyLink}>
            {dailyProblem.title}
          </a>
          <span className={styles.dailyDifficulty}>{dailyProblem.difficulty}</span>
        </div>
      )}

        <div className={styles.stats} aria-label="Platform statistics">
          <div className={styles.statItem}>
            <span className={styles.statValue}>100+</span>
            <span className={styles.statLabel}>{t('home_stat_problems', 'Problems')}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>5+</span>
            <span className={styles.statLabel}>{t('home_stat_languages', 'Languages')}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>24/7</span>
            <span className={styles.statLabel}>{t('home_stat_judge', 'Judge')}</span>
          </div>
        </div>

        <section aria-labelledby="faq-heading" style={{ marginTop: '4rem', maxWidth: '720px', margin: '4rem auto 0' }}>
          <h2 id="faq-heading" style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--foreground)' }}>
            {t('faq_heading', 'Frequently Asked Questions')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {faqSchema.mainEntity.map((item, i) => (
              <details key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1rem 1.25rem' }}>
                <summary style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--foreground)', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {item.name}
                  <span aria-hidden="true" style={{ color: 'var(--accent)', marginLeft: '1rem', flexShrink: 0 }}>+</span>
                </summary>
                <p style={{ marginTop: '0.75rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                  {item.acceptedAnswer.text}
                </p>
              </details>
            ))}
          </div>
        </section>
      </div>

      {/* COM-3: the live activity heartbeat (Wave C). */}
      <ActivityFeed />
    </>
  );
}
