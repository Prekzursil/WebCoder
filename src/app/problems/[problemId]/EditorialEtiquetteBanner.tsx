'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { palette } from '@/theme/tokens';

/**
 * EDT-5 — the editorial etiquette banner (DMOJ precedent): editorials are
 * a learning resource, not a shortcut; submitting an official solution you
 * did not derive yourself violates the rules. Rendered above every
 * editorial surface (official + community).
 */
export default function EditorialEtiquetteBanner() {
    const { t } = useTranslation();
    return (
        <p
            data-testid="editorial-etiquette"
            role="note"
            style={{
                color: palette.muted,
                fontStyle: 'italic',
                borderLeft: `3px solid ${palette.borderStrong}`,
                paddingLeft: '0.75rem',
            }}
        >
            {t(
                'editorial_etiquette',
                'Use this editorial only when stuck: submitting a solution you did not derive yourself is against the rules.'
            )}
        </p>
    );
}
