'use client';

import React from 'react';

/**
 * [Wave D atestats] The print button for the public verification page.
 * The global @media print stylesheet (globals.css, UXP-3) hides buttons
 * and chrome, so window.print() yields a clean certificate sheet.
 *
 * The label arrives as a prop (serialized from the server component's
 * translator) — this island stays free of locale state.
 */
export default function PrintCertificateButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      data-testid="print-certificate"
      style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
    >
      🖨 {label}
    </button>
  );
}
