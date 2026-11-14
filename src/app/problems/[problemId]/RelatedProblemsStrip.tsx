'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { RelatedProblemService } from '@/services/ApiService';
import { RelatedProblemRow } from '@/types/api';
import { palette } from '@/theme/tokens';

/** Matrix row 6 — "Similar problems": APPROVED problems sharing tags with
 * this one (the LeetCode Similar-Questions / Codewars related-by-tag
 * affordance), solved ones already dropped by the backend. */
export default function RelatedProblemsStrip({ problemId }: { problemId: number }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ro' ? 'ro' : 'en';
  const [related, setRelated] = useState<RelatedProblemRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    RelatedProblemService.list(problemId)
      .then((data) => {
        if (!cancelled) setRelated(data.results);
      })
      .catch(() => setRelated([]));
    return () => {
      cancelled = true;
    };
  }, [problemId]);

  if (related.length === 0) return null;
  return (
    <section
      aria-label={t('related_problems_title', 'Similar problems')}
      data-testid="related-problems"
    >
      <h3>{t('related_problems_title', 'Similar problems')}</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {related.map((problem) => (
          <li
            key={problem.id}
            data-testid={`related-problem-${problem.id}`}
            style={{ padding: '4px 0' }}
          >
            <Link href={`/problems/${problem.id}`} style={{ color: palette.accent }}>
              {String(problem.title_i18n[lang] ?? problem.title_i18n.en ?? '')}
            </Link>{' '}
            <span style={{ color: palette.muted, fontSize: '0.8rem' }}>{problem.difficulty}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
