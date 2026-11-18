'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { ProblemEmbedWidget } from '@/components/share/ShareWidgets';
import PageHeader from '@/components/common/PageHeader';
import { useTranslation } from 'react-i18next';

/**
 * Item 72 — the standalone embeddable problem widget page (iframe target):
 * minimal chrome, just the widget.
 */
export default function EmbedProblemPage() {
  const { t } = useTranslation();
  const params = useParams<{ problemId: string }>();
  const problemId = Number(params?.problemId);
  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '16px' }}>
      <PageHeader title={t('embed_title', 'WebCoder problem')} />
      {problemId ? <ProblemEmbedWidget problemId={problemId} /> : null}
    </main>
  );
}
