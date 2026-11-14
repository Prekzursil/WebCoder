'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { CertificateService, collectAllPages } from '@/services/ApiService';
import { CertificateType } from '@/types/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ProtectedRoute from '@/components/common/ProtectedRoute';

/**
 * [Wave D certifications — the honest variant] The holder's atestat list.
 *
 * Every certificate here is DERIVED from judged activity (rated-contest
 * finishes, rating milestones, solve milestones — never self-paced
 * unproctored "skill tests"), so the list is short and bounded:
 * collectAllPages is the right fetch strategy (a handful of pages at most).
 *
 * The public counterpart — anonymous verification by UUID + print/PDF —
 * lives at /certificates/[uuid].
 */

function achievementLine(cert: CertificateType, t: ReturnType<typeof useTranslation>['t']): string {
  if (cert.kind === 'CONTEST_PARTICIPATION') {
    const title = cert.details.contest_title_en ?? `#${cert.details.contest_id ?? ''}`;
    const parts = [title];
    if (cert.details.rank !== undefined) {
      parts.push(`${t('certificates_rank_label', 'Final rank')}: ${cert.details.rank}`);
    }
    if (cert.details.rating_after !== undefined) {
      parts.push(
        `${t('certificates_rating_label', 'Rating after contest')}: ${cert.details.rating_after}`,
      );
    }
    return parts.join(' · ');
  }
  if (cert.kind === 'RATING_MILESTONE') {
    return `≥ ${cert.details.threshold ?? ''}${
      cert.details.rating !== undefined ? ` (${cert.details.rating})` : ''
    }`;
  }
  return `${t('certificates_solved_label', 'Problems solved')}: ${
    cert.details.solved ?? cert.details.threshold ?? ''
  }`;
}

function kindLabel(kind: CertificateType['kind'], t: ReturnType<typeof useTranslation>['t']): string {
  switch (kind) {
    case 'CONTEST_PARTICIPATION':
      return t('certificates_kind_CONTEST_PARTICIPATION', 'Contest participation');
    case 'RATING_MILESTONE':
      return t('certificates_kind_RATING_MILESTONE', 'Rating milestone');
    default:
      return t('certificates_kind_SOLVE_MILESTONE', 'Solved-problems milestone');
  }
}

function CertificatesPageContent() {
  const { t } = useTranslation();
  const [certificates, setCertificates] = useState<CertificateType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await collectAllPages(CertificateService.getMyCertificates);
      setCertificates(rows);
    } catch {
      setError(t('certificates_load_error', 'Failed to load certificates.'));
    } finally {
      setLoading(false);
    }
    // The error string is itself localized; reload on language change.
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page-container" style={{ paddingTop: '2.5rem', maxWidth: '860px' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--foreground)' }}>
        {t('certificates_title', 'My certificates')}
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0.5rem 0 2rem', lineHeight: 1.7 }}>
        {t(
          'certificates_intro',
          'Certificates earned on WebCoder, each derived from judged activity: official rated-contest finishes, rating milestones and solved-problem milestones. Every certificate is publicly verifiable by its serial number.',
        )}
      </p>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <p role="alert" style={{ color: 'var(--danger, #b00)' }} data-testid="certificates-error">
          {error}
        </p>
      ) : certificates.length === 0 ? (
        <p style={{ color: 'var(--muted)' }} data-testid="certificates-empty">
          {t(
            'certificates_empty',
            'No certificates yet — officially finish a rated contest or solve your first 10 problems.',
          )}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '1rem' }} data-testid="certificates-list">
          {certificates.map((cert) => (
            <li
              key={cert.uuid}
              style={{
                border: '1px solid var(--border, #ccc)',
                borderRadius: '10px',
                padding: '1rem 1.25rem',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.75rem',
                alignItems: 'center',
                justifyContent: 'space-between',
                opacity: cert.status === 'REVOKED' ? 0.75 : 1,
              }}
            >
              <div style={{ minWidth: '220px', flex: 1 }}>
                <strong>{kindLabel(cert.kind, t)}</strong>
                <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  {achievementLine(cert, t)}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  {t('certificates_serial_label', 'Serial')}:{' '}
                  <span data-testid={`certificate-serial-${cert.uuid}`} style={{ fontFamily: 'monospace' }}>
                    {cert.serial}
                  </span>{' '}
                  · {t('certificates_issued_label', 'Issued')}: {cert.issued_at.slice(0, 10)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <span
                  data-testid={`certificate-status-${cert.uuid}`}
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                    color: '#fff',
                    background:
                      cert.status === 'REVOKED' ? 'var(--danger, #b00)' : 'var(--success, #080)',
                  }}
                >
                  {cert.status === 'REVOKED'
                    ? t('certificates_revoked_badge', 'Revoked')
                    : t('certificates_valid_badge', 'Valid')}
                </span>
                <Link href={`/certificates/${cert.uuid}`} style={{ fontSize: '0.85rem' }}>
                  {t('certificates_view_verify', 'View / verify')}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CertificatesPage() {
  return (
    <ProtectedRoute roles={['ADMIN', 'PROBLEM_CREATOR', 'PROBLEM_VERIFIER', 'TEACHER', 'BASIC_USER', 'BASIC', 'CREATOR', 'VERIFIER']}>
      <CertificatesPageContent />
    </ProtectedRoute>
  );
}
