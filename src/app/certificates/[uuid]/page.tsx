// [Wave D certifications — H-120 verifiable participation certificates]
// The PUBLIC atestat page: anyone (employer, teacher, admission board)
// opens /certificates/<uuid> — no account — and sees the frozen
// achievement, the serial, and an honest VALID / REVOKED banner.
// A revoked certificate keeps answering (with its reason) instead of
// vanishing — that is the point of a verification ledger.
//
// Server-rendered + 60s revalidated (certificates-api.ts); the print
// button island triggers the browser's print/save-as-PDF dialog over the
// global UXP-3 print stylesheet.

import type { Metadata } from 'next';
import Link from 'next/link';
import { createTranslator, getLocale } from '../../_lib/public-i18n';
import { getCertificate } from '../_lib/certificates-api';
import type { CertificateType } from '@/types/api';
import PrintCertificateButton from './PrintCertificateButton';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ uuid: string }>;
}): Promise<Metadata> {
  const { uuid } = await params;
  const t = createTranslator(await getLocale());
  let serial = '';
  try {
    const cert = await getCertificate(uuid);
    if (cert) serial = ` — ${cert.serial}`;
  } catch {
    // Metadata is best-effort; the page body handles fetch failures.
  }
  return {
    title: `${t('certificates_verify_title', 'Certificate verification')}${serial}`,
    robots: { index: false },
  };
}

function achievementRows(
  cert: CertificateType,
  t: ReturnType<typeof createTranslator>,
  locale: string,
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (cert.kind === 'CONTEST_PARTICIPATION') {
    const title =
      locale === 'ro' && cert.details.contest_title_ro
        ? cert.details.contest_title_ro
        : (cert.details.contest_title_en ?? `#${cert.details.contest_id ?? ''}`);
    rows.push({
      label: t('certificates_kind_CONTEST_PARTICIPATION', 'Contest participation'),
      value: title,
    });
    if (cert.details.rank !== undefined) {
      rows.push({
        label: t('certificates_rank_label', 'Final rank'),
        value: String(cert.details.rank),
      });
    }
    if (cert.details.rating_after !== undefined) {
      rows.push({
        label: t('certificates_rating_label', 'Rating after contest'),
        value: String(cert.details.rating_after),
      });
    }
  } else if (cert.kind === 'RATING_MILESTONE') {
    rows.push({
      label: t('certificates_kind_RATING_MILESTONE', 'Rating milestone'),
      value: `≥ ${cert.details.threshold ?? ''}`,
    });
  } else {
    rows.push({
      label: t('certificates_solved_label', 'Problems solved'),
      value: String(cert.details.solved ?? cert.details.threshold ?? ''),
    });
  }
  return rows;
}

export default async function CertificateVerifyPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const locale = await getLocale();
  const t = createTranslator(locale);
  const cert = await getCertificate(uuid);

  if (!cert) {
    return (
      <div className="page-container" style={{ paddingTop: '2.5rem', maxWidth: '640px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--foreground)' }}>
          {t('certificates_not_found_title', 'Certificate not found')}
        </h1>
        <p style={{ color: 'var(--muted)', marginTop: '0.75rem', lineHeight: 1.7 }}>
          {t(
            'certificates_not_found_body',
            'This verification link does not match any certificate. Check the serial or link and try again.',
          )}
        </p>
      </div>
    );
  }

  const revoked = cert.status === 'REVOKED';
  const verifyUrl = `/certificates/${cert.uuid}`;

  return (
    <div className="page-container" style={{ paddingTop: '2rem', maxWidth: '720px' }}>
      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>
        {t('certificates_verify_title', 'Certificate verification')}
      </p>

      {/* The printable atestat sheet. */}
      <section
        data-testid="certificate-card"
        style={{
          border: '3px double var(--foreground, #222)',
          borderRadius: '12px',
          padding: '2rem',
          background: 'var(--card, #fff)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <strong style={{ fontSize: '1.25rem', letterSpacing: '0.04em' }}>WebCoder</strong>
          <span style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
            {t('certificates_serial_label', 'Serial')}: {cert.serial}
          </span>
        </div>

        <h1
          style={{
            fontSize: '1.4rem',
            fontWeight: 800,
            margin: '1.5rem 0 0.25rem',
            textAlign: 'center',
          }}
        >
          {cert.kind === 'CONTEST_PARTICIPATION'
            ? t('certificates_kind_CONTEST_PARTICIPATION', 'Contest participation')
            : cert.kind === 'RATING_MILESTONE'
              ? t('certificates_kind_RATING_MILESTONE', 'Rating milestone')
              : t('certificates_kind_SOLVE_MILESTONE', 'Solved-problems milestone')}
        </h1>

        <p style={{ textAlign: 'center', color: 'var(--muted)', margin: '0 0 1.5rem' }}>
          {t('certificates_holder_label', 'Awarded to')}:{' '}
          <strong style={{ color: 'var(--foreground)' }}>{cert.holder}</strong>
        </p>

        <dl style={{ margin: '0 0 1.5rem', display: 'grid', gap: '0.4rem' }}>
          {achievementRows(cert, t, locale).map((row) => (
            <div
              key={row.label}
              style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between' }}
            >
              <dt style={{ color: 'var(--muted)' }}>{row.label}</dt>
              <dd style={{ margin: 0, fontWeight: 600, textAlign: 'right' }}>{row.value}</dd>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between' }}>
            <dt style={{ color: 'var(--muted)' }}>{t('certificates_issued_label', 'Issued')}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{cert.issued_at.slice(0, 10)}</dd>
          </div>
        </dl>

        <p
          data-testid="certificate-verdict"
          role="status"
          style={{
            textAlign: 'center',
            fontWeight: 700,
            padding: '0.5rem 0.75rem',
            borderRadius: '8px',
            color: revoked ? 'var(--danger, #b00)' : 'var(--success, #080)',
            border: `1px solid ${revoked ? 'var(--danger, #b00)' : 'var(--success, #080)'}`,
          }}
        >
          {revoked
            ? t('certificates_verify_revoked', 'This certificate has been revoked.')
            : t('certificates_verify_valid', 'This certificate is valid.')}
        </p>
        {revoked && cert.revoked_reason ? (
          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--muted)' }}>
            {t('certificates_verify_revoked_reason_label', 'Reason')}: {cert.revoked_reason}
          </p>
        ) : null}
      </section>

      {/* Screen-only controls (the print stylesheet hides them). */}
      <div
        style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '1.25rem' }}
        data-noprint
      >
        <PrintCertificateButton label={t('certificates_print_button', 'Print / save as PDF')} />
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
          {t('certificates_verify_note', 'Anyone can verify this certificate at')}{' '}
          <code style={{ fontFamily: 'monospace' }}>{verifyUrl}</code>
        </p>
      </div>
      <p style={{ marginTop: '1.5rem' }}>
        <Link href="/certificates" style={{ fontSize: '0.85rem' }}>
          ← {t('certificates_title', 'My certificates')}
        </Link>
      </p>
    </div>
  );
}
