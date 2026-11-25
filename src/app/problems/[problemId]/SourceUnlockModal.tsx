'use client';

// Problem-page wave (item F) — the source-code unlock economy.
//
// Reference solutions are unlockable BEFORE solving, behind a confirm
// modal stating the warning VERBATIM:
//   "unlocking the source code before the problem is solved means the
//    problem will NOT award points to this account"
// Buttons: 'I understand — unlock source code' vs
//          'Cancel — go back to solving'.
// Confirming records the PERMANENT per-user-per-problem forfeiture
// server-side and reveals the reference source; the problem page then
// shows the forfeited state forever (no points ever; editorial/source
// visible).

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { SolverService } from '@/services/ApiService';
import { palette, hexAlpha } from '@/theme/tokens';

/** The verbatim forfeiture warning (owner-specified text — do not reword). */
export const FORFEIT_WARNING =
  'unlocking the source code before the problem is solved means the problem will NOT award points to this account';

export default function SourceUnlockModal({
  problemId,
  open,
  onClose,
  onUnlocked,
}: {
  problemId: string;
  open: boolean;
  onClose: () => void;
  onUnlocked?: (code: string | null, language: string | null) => void;
}): ReactNode {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await SolverService.unlockSource(problemId);
      onUnlocked?.(response.reference_solution_code, response.reference_language);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const btn = (base: React.CSSProperties): React.CSSProperties => ({
    padding: '8px 16px',
    borderRadius: '8px',
    fontWeight: 600,
    fontSize: '0.85rem',
    cursor: busy ? 'not-allowed' : 'pointer',
    ...base,
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('forfeit_modal_title', 'Unlock the reference source code?')}
      data-testid="source-unlock-modal"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1300,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          maxWidth: '560px',
          width: '90%',
          background: 'var(--surface)',
          border: `1px solid ${hexAlpha(palette.danger, 0.4)}`,
          borderRadius: 'var(--radius-lg, 12px)',
          padding: '20px 24px',
          display: 'grid',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', color: 'var(--danger)' }}>
          <WarningAmberIcon />
          <strong style={{ fontSize: '1rem' }}>
            {t('forfeit_modal_title', 'Unlock the reference source code?')}
          </strong>
        </div>
        <p data-testid="forfeit-warning-text" style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.6 }}>
          {t('forfeit_modal_text', {
            defaultValue:
              'Warning: {{warning}}. This is permanent — the problem will never award points to this account again (the editorial and source stay visible).',
            warning: FORFEIT_WARNING,
          })}
        </p>
        {error && <p style={{ margin: 0, color: 'var(--danger)', fontSize: '0.8rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            style={btn({
              background: 'rgba(56,189,248,0.15)',
              color: 'var(--accent)',
              border: '1px solid rgba(56,189,248,0.3)',
            })}
            onClick={() => void confirm()}
            disabled={busy}
            data-testid="forfeit-confirm"
          >
            {t('forfeit_confirm_button', 'I understand — unlock source code')}
          </button>
          <button
            type="button"
            style={btn({
              background: 'var(--surface-2, var(--surface))',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
            })}
            onClick={onClose}
            disabled={busy}
            data-testid="forfeit-cancel"
          >
            {t('forfeit_cancel_button', 'Cancel — go back to solving')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The revealed reference source block (post-unlock / post-AC view). */
export function ReferenceSource({
  code,
  language,
}: {
  code: string | null;
  language: string | null;
}): ReactNode {
  const { t } = useTranslation();
  if (!code) return null;
  return (
    <div data-testid="reference-source" style={{ display: 'grid', gap: '6px' }}>
      <div className="micro-label" style={{ color: 'var(--muted)' }}>
        {t('reference_source_label', {
          defaultValue: 'Reference solution ({{language}})',
          language: language ?? '',
        })}
      </div>
      <SyntaxHighlighter
        language={language === 'python3' ? 'python' : 'cpp'}
        style={vscDarkPlus}
        customStyle={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.8rem',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
