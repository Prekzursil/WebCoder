'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import styles from './footer.module.css';

// Site footer [SPEC-GAPS A13]: brand + tagline, muted link bars (Platform /
// Resources / Account), language switcher mirror, copyright row. Reuses the
// .page-container width and the surface tokens.
const Footer: React.FC = () => {
  const { i18n, t } = useTranslation();
  const auth = useAuth();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lng;
    }
  };

  const platformLinks = [
    { href: '/problems', label: t('nav_problems', 'Problems') },
    { href: '/leaderboard', label: t('nav_leaderboard', 'Leaderboard') },
    { href: '/forum', label: t('nav_forum', 'Forum') },
  ];
  const accountLinks = auth.isAuthenticated
    ? [
        { href: '/profile', label: t('nav_profile', 'Profile') },
        { href: '/my-submissions', label: t('nav_my_submissions', 'My Submissions') },
      ]
    : [
        { href: '/login', label: t('nav_login', 'Login') },
        { href: '/register', label: t('nav_register', 'Register') },
      ];

  const column = (title: string, links: { href: string; label: string }[]) => (
    <div className={styles.col}>
      <div className={styles.colTitle}>{title}</div>
      <div className={styles.colLinks}>
        {links.map(({ href, label }) => (
          <Link key={href} href={href} className={styles.link}>{label}</Link>
        ))}
      </div>
    </div>
  );

  return (
    <footer className={styles.footer} aria-label="Site footer">
      <div className={styles.inner}>
        <div className={styles.topRow}>
          <div className={styles.brandBlock}>
            <Link href="/" className={styles.brand}>
              <span className={styles.brandMark}>W</span>
              {t('app_title', 'WebCoder')}
            </Link>
            <p className={styles.tagline}>
              {t('footer_tagline', 'Online judge for competitive programming — Python 3, C++17, and Java 11.')}
            </p>
          </div>
          {column(t('footer_platform', 'Platform'), platformLinks)}
          {column(t('footer_account', 'Account'), accountLinks)}
        </div>

        <div className={styles.bottomRow}>
          <span className={styles.copyright}>
            © {new Date().getFullYear()} WebCoder
          </span>
          <div className={styles.langSwitch} role="group" aria-label={t('nav_language_label', 'Language')}>
            {['en', 'ro'].map((lng) => (
              <button
                key={lng}
                onClick={() => changeLanguage(lng)}
                className={`${styles.langBtn} ${i18n.language === lng ? styles.langBtnActive : ''}`}
              >
                {lng}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
