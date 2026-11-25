'use client';

// [roadmap EDT-2 → problem-page wave item D] Tiered hints area — DISTINCT
// from the editorial: at most three tiers (1 gentle nudge, 2 stronger,
// 3 approach outline), text + embedded images/diagrams, voluntarily
// unlocked, FREE (no point penalty). Every reveal is recorded per
// (user, problem, tier) for analytics + the author dashboard.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SolverService, type HintState } from '@/services/ApiService';
import StatementMarkdown from '@/components/common/StatementMarkdown';
import { palette, hexAlpha } from '@/theme/tokens';

const TIER_LABELS: Record<number, string> = {
  1: 'hints_tier_1',
  2: 'hints_tier_2',
  3: 'hints_tier_3',
};

const TIER_DEFAULTS: Record<number, string> = {
  1: 'Gentle nudge',
  2: 'Stronger hint',
  3: 'Approach outline',
};

export default function HintsPanel({
  problemId,
  hintState,
}: {
  problemId: string;
  hintState: HintState;
}): ReactNode {
  const { t } = useTranslation();
  const [state, setState] = useState<HintState>(hintState);
  const [busyTier, setBusyTier] = useState<number | null>(null);

  if (!state || state.total === 0) return null;

  const reveal = async (tier: number) => {
    setBusyTier(tier);
    try {
      const next = await SolverService.revealHint(problemId, tier);
      setState(next);
    } finally {
      setBusyTier(null);
    }
  };

  return (
    <div
      data-testid="hints-panel"
      style={{
        background: hexAlpha(palette.warn, 0.05),
        border: `1px solid ${hexAlpha(palette.warn, 0.2)}`,
        borderRadius: 'var(--radius-md)',
        padding: '1rem 1.25rem',
        display: 'grid',
        gap: '0.75rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        <div
          className="micro-label"
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            color: 'var(--warn)',
            letterSpacing: '0.06em',
          }}
        >
          {t('hints_header_tiers', 'Hints — three tiers, reveal what you need')}
        </div>
        <span data-testid="hints-free-note" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
          {t('hints_free_note', 'Hints are free — no point penalty.')}
        </span>
      </div>
      <div style={{ display: 'grid', gap: '0.6rem' }}>
        {state.tiers.map((tier) => (
          <div
            key={tier.tier}
            data-testid={`hint-tier-${tier.tier}`}
            style={{
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '8px 12px',
              background: tier.revealed ? hexAlpha(palette.warn, 0.06) : 'transparent',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <strong style={{ fontSize: '0.8rem' }}>
                {tier.tier}.{' '}
                {t(TIER_LABELS[tier.tier] ?? 'hints_tier_1', TIER_DEFAULTS[tier.tier] ?? '')}
              </strong>
              {!tier.revealed ? (
                <button
                  type="button"
                  className="btn"
                  data-testid={`hint-reveal-${tier.tier}`}
                  style={{ padding: '3px 12px', fontSize: '0.72rem', minHeight: '28px' }}
                  disabled={busyTier === tier.tier}
                  onClick={() => void reveal(tier.tier)}
                >
                  {busyTier === tier.tier
                    ? t('hints_revealing', 'Revealing…')
                    : t('hints_reveal_button', 'Reveal')}
                </button>
              ) : (
                <span
                  data-testid={`hint-revealed-${tier.tier}`}
                  style={{ fontSize: '0.72rem', color: 'var(--warn)', fontWeight: 700 }}
                >
                  {t('hints_revealed_label', 'Revealed')}
                </span>
              )}
            </div>
            {tier.revealed && (
              <div style={{ marginTop: '6px', fontSize: '0.85rem' }}>
                <StatementMarkdown markdown={tier.content ?? ''} />
                {tier.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tier.image}
                    alt=""
                    data-testid={`hint-image-${tier.tier}`}
                    style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '6px' }}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
