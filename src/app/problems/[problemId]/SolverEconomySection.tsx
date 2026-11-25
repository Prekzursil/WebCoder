'use client';

// Problem-page wave (items E/F) — the editorial + source-unlock economy,
// composed so the editorial's "unlock early" CTA and the source modal
// share one forfeit flow: confirming the VERBATIM warning records the
// permanent per-user-per-problem forfeiture, after which BOTH the
// editorial and the reference source stay visible (and the problem never
// awards points to this account again — the banner says so).

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import EditorialPanel from './EditorialPanel';
import SourceUnlockModal, { ReferenceSource } from './SourceUnlockModal';
import { palette, hexAlpha } from '@/theme/tokens';

export default function SolverEconomySection({
  problemId,
  hasEditorial,
  forfeited,
  referenceCode,
  referenceLanguage,
  locale,
}: {
  problemId: string;
  hasEditorial: boolean;
  forfeited: boolean;
  referenceCode: string | null;
  referenceLanguage: string | null;
  locale: 'en' | 'ro';
}): ReactNode {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [isForfeited, setIsForfeited] = useState(forfeited);
  const [revealed, setRevealed] = useState<{ code: string | null; language: string | null } | null>(
    forfeited ? { code: referenceCode, language: referenceLanguage } : null,
  );

  return (
    <>
      {isForfeited && (
        <div
          data-testid="forfeited-banner"
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: hexAlpha(palette.danger, 0.08),
            border: `1px solid ${hexAlpha(palette.danger, 0.35)}`,
            color: 'var(--danger)',
            fontSize: '0.82rem',
            marginBottom: '0.75rem',
          }}
        >
          <LockOpenOutlinedIcon fontSize="small" />
          {t('forfeited_banner', {
            defaultValue:
              'Points forfeited on this problem — it will never award points to this account. The editorial and reference source stay visible.',
          })}
        </div>
      )}
      <EditorialPanel
        problemId={problemId}
        hasEditorial={hasEditorial}
        locale={locale}
        onUnlockEarly={() => setModalOpen(true)}
        reloadKey={isForfeited ? 1 : 0}
      />
      <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.6rem' }}>
        {revealed?.code ? (
          <ReferenceSource code={revealed.code} language={revealed.language} />
        ) : (
          !isForfeited && (
            <button
              type="button"
              className="btn"
              data-testid="unlock-source-button"
              style={{ justifySelf: 'start', fontSize: '0.78rem', minHeight: '32px' }}
              onClick={() => setModalOpen(true)}
            >
              {t('unlock_source_button', 'Unlock the reference source code')}
            </button>
          )
        )}
      </div>
      <SourceUnlockModal
        problemId={problemId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onUnlocked={(code, language) => {
          setIsForfeited(true);
          setRevealed({ code, language });
        }}
      />
    </>
  );
}
