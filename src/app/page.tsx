// Ported from frontend/webcoder_ui/src/pages/HomePage.tsx (CRA reference) —
// route "/" (App.tsx:30).
//
// Static server component (no data fetching; the task brief allows a static
// home). The auth-gated Sign Up CTA becomes a small client island
// (HomeSignUpButton) because auth lives in localStorage and is only knowable
// after hydration — the same information timing as the CRA SPA.

import type { Metadata } from 'next';
import Link from 'next/link';
import { createTranslator, getLocale } from './_lib/public-i18n';
import HomeSignUpButton from './HomeSignUpButton';
import styles from './home.module.css';

export const metadata: Metadata = {
  title: 'WebCoder — Competitive Programming Platform',
  description:
    'Sharpen your skills, solve challenging problems, and compete with a community of developers from around the world.',
};

export default async function HomePage() {
  const t = createTranslator(await getLocale());

  return (
    <main className={styles.home}>
      <h1 className={styles.title}>{t('welcome_message', 'Welcome to WebCoder')}</h1>
      <h2 className={styles.subtitle}>
        {t('homepage_subtitle', 'The ultimate platform for competitive programming.')}
      </h2>
      <p className={styles.description}>
        {t(
          'homepage_description',
          'Sharpen your skills, solve challenging problems, and compete with a community of developers from around the world. Whether you are a beginner or an expert, WebCoder has something for you.'
        )}
      </p>
      <div className={styles.actions}>
        <Link href="/problems" className={`${styles.button} ${styles.buttonPrimary}`}>
          {t('view_problems_button', 'View Problems')}
        </Link>
        <HomeSignUpButton label={t('sign_up_button', 'Sign Up')} />
      </div>
    </main>
  );
}
