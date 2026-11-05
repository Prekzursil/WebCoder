"use client";

import React from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import LanguageSwitcher from "@/components/common/LanguageSwitcher";
import styles from "./footer.module.css";

// Site footer [SPEC-GAPS A13]: brand + tagline, muted link bars (Platform /
// Resources / Account), language switcher mirror, copyright row. Reuses the
// .page-container width and the surface tokens.
const Footer: React.FC = () => {
  const { t } = useTranslation();
  const auth = useAuth();

  // [LEG-1] Legal row: terms + privacy ride beside the platform links.
  const legalLinks = [
    { href: "/terms", label: t("footer_terms", "Terms") },
    { href: "/privacy", label: t("footer_privacy", "Privacy") },
    // [OPS-7] Donations + sponsorship (groundwork: informational page).
    { href: "/support", label: t("footer_support", "Support us") },
    // [OPS-5] Published accessibility commitment.
    { href: "/accessibility", label: t("footer_accessibility", "Accessibility") },
  ];

  const platformLinks = [
    { href: "/problems", label: t("nav_problems", "Problems") },
    { href: "/leaderboard", label: t("nav_leaderboard", "Leaderboard") },
    { href: "/forum", label: t("nav_forum", "Forum") },
  ];
  const accountLinks = auth.isAuthenticated
    ? [
        { href: "/profile", label: t("nav_profile", "Profile") },
        { href: "/my-submissions", label: t("nav_my_submissions", "My Submissions") },
        // [JDG-9] Published judge toolchain docs + [SAF-2] the AI policy.
        { href: "/help/judge", label: t("footer_judge_docs", "The judge") },
        { href: "/contribute", label: t("footer_contribute", "Contribute") },
        { href: "/policies/ai", label: t("footer_ai_policy", "Contest AI policy") },
      ]
    : [
        { href: "/login", label: t("nav_login", "Login") },
        { href: "/register", label: t("nav_register", "Register") },
      ];

  const column = (title: string, links: { href: string; label: string }[]) => (
    <div className={styles.col}>
      <div className={styles.colTitle}>{title}</div>
      <div className={styles.colLinks}>
        {links.map(({ href, label }) => (
          <Link key={href} href={href} className={styles.link}>
            {label}
          </Link>
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
              {t("app_title", "WebCoder")}
            </Link>
            <p className={styles.tagline}>
              {t(
                "footer_tagline",
                "Online judge for competitive programming — Python 3, C++17, and Java 11.",
              )}
            </p>
          </div>
          {column(t("footer_platform", "Platform"), platformLinks)}
          {column(t("footer_account", "Account"), accountLinks)}
          {column(t("footer_legal", "Legal"), legalLinks)}
        </div>

        <div className={styles.bottomRow}>
          <span className={styles.copyright}>© {new Date().getFullYear()} WebCoder</span>
          {/* [i18n wave] ten locales: shared picker (writes the i18next
              cookie + syncs <html lang> internally). */}
          <LanguageSwitcher className={styles.langSelect} />
        </div>
      </div>
    </footer>
  );
};

export default Footer;
