'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';

// Ported from frontend/webcoder_ui/src/components/common/LoadingSpinner.tsx (CRA reference).
// [SPEC-GAPS A11] The light-theme leftover inline <style> (rgba(0,0,0,0.1)
// track + off-palette #09f arc) is gone: the .spinner class in globals.css
// draws the track from var(--surface-2) and the arc from var(--accent).

const LoadingSpinner: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div
      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', minHeight: '100px' }}
      role="status"
      aria-live="polite"
    >
      <div className="spinner" aria-hidden="true"></div>
      <p style={{ marginLeft: '10px' }}>{t('loading', 'Loading...')}</p>
    </div>
  );
};

export default LoadingSpinner;
