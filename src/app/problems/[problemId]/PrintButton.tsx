'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * UXP-3 — the statement print route: the print stylesheet (globals.css
 * @media print) hides the chrome, so the browser's Print/Save-as-PDF
 * dialog produces a clean statement sheet for offline/olympiad use.
 */
export default function PrintButton() {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            onClick={() => window.print()}
            data-testid="print-statement"
            style={{ fontSize: '0.8rem' }}
        >
            🖨 {t('print_statement', 'Print / PDF')}
        </button>
    );
}
