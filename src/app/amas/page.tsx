'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/common/PageHeader';
import { AmaHub, ProblemRequestBoard, ReputationCard } from './AmaComponents';

/**
 * Items 66/68/69 — the community hub page: the caller's reputation card,
 * the medalist AMA sessions and the problem-request board.
 */
export default function AmasPage() {
  const { t } = useTranslation();
  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader
        title={t('amas_title', 'Community hub')}
        subtitle={t(
          'amas_subtitle',
          'AMAs with medalists, the problem-request board and your reputation.',
        )}
      />
      <ReputationCard />
      <AmaHub />
      <ProblemRequestBoard />
    </main>
  );
}
