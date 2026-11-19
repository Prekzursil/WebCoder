import type { Metadata } from 'next';
import { createTranslator, getLocale } from '../_lib/public-i18n';

// [Wave G item 119] The bug bounty page: scope, rewards table and the
// reporting channel (GitHub Private Vulnerability Reporting — the same
// channel SECURITY.md pins). Rewards are acknowledgements + swag-tier
// credits; no cash program exists pre-traction, and the page says so
// plainly instead of implying one.

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getLocale());
  return { title: t('bounty_title', 'Security & bug bounty') };
}

export default async function SecurityBountyPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);

  const scope: { key: string; body: string }[] = [
    {
      key: 'in',
      body: t(
        'bounty_scope_in',
        'In scope: the Django API and judge pipeline (backend/), the Next.js app (src/), the Expo mobile client (mobile/), and the deployed site. Authentication bypasses, sandbox escapes from judged submissions, privilege-escalation across roles, and data-leak endpoints are the headline classes.',
      ),
    },
    {
      key: 'out',
      body: t(
        'bounty_scope_out',
        'Out of scope: volumetric DoS, self-XSS, missing best-practice headers with no demonstrated impact, automated scanner output without a working proof, and issues in third-party services we merely run.',
      ),
    },
  ];

  const tiers: { key: string; name: string; examples: string }[] = [
    {
      key: 'critical',
      name: t('bounty_tier_critical', 'Critical'),
      examples: t(
        'bounty_tier_critical_body',
        'Judge sandbox escape, RCE, auth bypass. Hall of fame + supporter-tier badge for life.',
      ),
    },
    {
      key: 'high',
      name: t('bounty_tier_high', 'High'),
      examples: t(
        'bounty_tier_high_body',
        'Cross-user data access, privilege escalation. Hall of fame + supporter-tier badge for a year.',
      ),
    },
    {
      key: 'medium',
      name: t('bounty_tier_medium', 'Medium'),
      examples: t(
        'bounty_tier_medium_body',
        'Meaningful XSS/CSRF with user impact, rate-limit bypasses on judge surfaces. Hall of fame.',
      ),
    },
    {
      key: 'low',
      name: t('bounty_tier_low', 'Low'),
      examples: t(
        'bounty_tier_low_body',
        'Minor leaks, hardening gaps. Credit in the quarterly transparency report.',
      ),
    },
  ];

  return (
    <div className="page-container">
      <h1 style={{ fontSize: '1.75rem', color: 'var(--foreground)' }}>
        {t('bounty_header', 'Security & bug bounty')}
      </h1>
      <p style={{ color: 'var(--body)', maxWidth: 720, marginTop: '0.5rem' }}>
        {t(
          'bounty_intro',
          'WebCoder runs a judge that executes untrusted code and stores student work — we take reports seriously and answer fast. There is no cash bounty program pre-traction; recognition is the hall of fame and supporter-tier badges described below.',
        )}
      </p>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <strong style={{ color: 'var(--foreground)' }}>
          {t('bounty_reporting_header', 'How to report')}
        </strong>
        <p style={{ color: 'var(--body)', fontSize: '0.9rem' }}>
          {t(
            'bounty_reporting_body',
            'Use GitHub Private Vulnerability Reporting on the repository (Security → Report a vulnerability). Please do not open public issues for undisclosed findings. We aim to acknowledge within 48 hours — the same SLA our abuse queue publishes.',
          )}
        </p>
        <a
          className="btn btn--primary"
          href="https://github.com/Prekzursil/WebCoder/security/advisories/new"
        >
          {t('bounty_report_cta', 'Report privately on GitHub →')}
        </a>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <strong style={{ color: 'var(--foreground)' }}>{t('bounty_scope', 'Scope')}</strong>
        {scope.map((row) => (
          <p key={row.key} style={{ color: 'var(--body)', fontSize: '0.9rem' }}>
            {row.body}
          </p>
        ))}
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <strong style={{ color: 'var(--foreground)' }}>
          {t('bounty_tiers_header', 'Recognition tiers')}
        </strong>
        <table style={{ marginTop: '0.5rem' }}>
          <thead>
            <tr>
              <th>{t('bounty_tier_col', 'Tier')}</th>
              <th>{t('bounty_examples_col', 'Examples & recognition')}</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => (
              <tr key={tier.key}>
                <td style={{ fontWeight: 700 }}>{tier.name}</td>
                <td style={{ color: 'var(--body)' }}>{tier.examples}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
