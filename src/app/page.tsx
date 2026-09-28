// Ported from frontend/webcoder_ui/src/pages/HomePage.tsx (CRA reference)

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
      <div className={styles.badge}>
        ✦ Competitive Programming Platform
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
      <div className={styles.stats}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>100+</span>
          <span className={styles.statLabel}>Problems</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>5+</span>
          <span className={styles.statLabel}>Languages</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>24/7</span>
          <span className={styles.statLabel}>Judge</span>
        </div>
      </div>
    </main>
  );
}
