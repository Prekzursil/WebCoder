'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProblemService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import { palette } from '@/theme/tokens';
import PageHeader from '@/components/common/PageHeader';
import Link from 'next/link';

/**
 * Items 121/123/124/134 — the visual authoring wizard: an ordered step
 * checklist with live per-step completion for a chosen draft, plus the
 * statement-lint warnings, the readability band and the translation
 * sidecar gaps on the Review step.
 */

interface WizardStep {
  key: string;
  title_en: string;
  description_en: string;
  fields: string[];
  complete: boolean;
}

interface LintWarning {
  code: string;
  locale: string;
  message: string;
}

interface ReadabilityReport {
  locales: Record<string, { score: number | null; band: string | null; words: number }>;
  consistent: boolean | null;
}

interface TranslationStatus {
  fields: string[];
  locales: Record<string, Record<string, boolean>>;
  complete: boolean;
}

export default function AuthorWizardPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [problemId, setProblemId] = useState('');
  const [steps, setSteps] = useState<WizardStep[] | null>(null);
  const [lint, setLint] = useState<LintWarning[] | null>(null);
  const [readability, setReadability] = useState<ReadabilityReport | null>(null);
  const [translation, setTranslation] = useState<TranslationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAuthor = useMemo(
    () =>
      auth.user?.role === 'PROBLEM_CREATOR' ||
      auth.user?.role === 'PROBLEM_VERIFIER' ||
      auth.user?.role === 'TEACHER' ||
      auth.user?.role === 'ADMIN',
    [auth.user?.role],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await ProblemService.getWizardSteps(problemId ? Number(problemId) : undefined);
      setSteps(data.steps);
      setLint(null);
      setReadability(null);
      setTranslation(null);
      if (problemId) {
        const [lintData, readData, transData] = await Promise.all([
          ProblemService.statementLint(Number(problemId)).catch(() => null),
          ProblemService.getReadability(Number(problemId)).catch(() => null),
          ProblemService.getTranslationStatus(Number(problemId)).catch(() => null),
        ]);
        if (lintData) setLint(lintData.warnings);
        if (readData) setReadability(readData);
        if (transData) setTranslation(transData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    }
  }, [problemId]);

  useEffect(() => {
    if (isAuthor) load();
  }, [isAuthor, load]);

  if (!isAuthor) {
    return (
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
        <PageHeader title={t('wizard_title', 'Authoring wizard')} />
        <p style={{ color: palette.muted }}>
          {t('wizard_creators_only', 'The wizard is for problem creators and verifiers.')}
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader
        title={t('wizard_title', 'Authoring wizard')}
        subtitle={t(
          'wizard_subtitle',
          'Seven steps from idea to submission — with live completion checks.',
        )}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          value={problemId}
          onChange={(e) => setProblemId(e.target.value)}
          placeholder={t('wizard_problem_id', 'Draft problem id (optional)')}
          aria-label={t('wizard_problem_id', 'Draft problem id (optional)')}
          style={{ width: 260, padding: 8 }}
          data-testid="wizard-problem-input"
        />
        <Link href="/problems/create" style={{ color: palette.accent, alignSelf: 'center' }}>
          {t('wizard_new_problem', 'Start a new problem →')}
        </Link>
      </div>
      {error && (
        <p role="alert" style={{ color: palette.danger }}>
          {error}
        </p>
      )}
      {steps === null ? (
        <p aria-busy="true">{t('loading', 'Loading…')}</p>
      ) : (
        <ol style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
          {steps.map((step, index) => (
            <li
              key={step.key}
              data-testid={`wizard-step-${step.key}`}
              style={{
                border: `1px solid ${step.complete ? palette.success : palette.border}`,
                borderRadius: 10,
                padding: 12,
                display: 'flex',
                gap: 10,
                alignItems: 'baseline',
              }}
            >
              <span
                data-testid={`wizard-step-check-${step.key}`}
                style={{ color: step.complete ? palette.success : palette.muted }}
              >
                {step.complete ? '✓' : '○'}
              </span>
              <div>
                <strong>
                  {index + 1}. {step.title_en}
                </strong>
                <div style={{ color: palette.muted, fontSize: '0.85rem' }}>
                  {step.description_en}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {lint !== null && (
        <section style={{ marginTop: 16 }} data-testid="wizard-lint">
          <h3>{t('wizard_lint_title', 'Statement lint')}</h3>
          {lint.length === 0 ? (
            <p style={{ color: palette.success }}>
              {t('wizard_lint_clean', 'No warnings — the statement reads well.')}
            </p>
          ) : (
            <ul style={{ color: palette.warn, fontSize: '0.9rem' }}>
              {lint.map((warning) => (
                <li key={warning.code} data-testid={`wizard-lint-${warning.code}`}>
                  <strong>{warning.locale.toUpperCase()}</strong>: {warning.message}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {readability && (
        <section style={{ marginTop: 14 }} data-testid="wizard-readability">
          <h3>{t('wizard_readability_title', 'Readability')}</h3>
          {Object.entries(readability.locales).map(([locale, entry]) => (
            <p key={locale} data-testid={`wizard-readability-${locale}`}>
              <strong>{locale.toUpperCase()}</strong>: {entry.score} ({entry.band})
            </p>
          ))}
          {readability.consistent !== null && (
            <p style={{ color: readability.consistent ? palette.success : palette.warn }}>
              {readability.consistent
                ? t('wizard_readability_consistent', 'Locales read consistently.')
                : t(
                    'wizard_readability_drift',
                    'Locales drift in reading level — simplify the harder one.',
                  )}
            </p>
          )}
        </section>
      )}

      {translation && (
        <section style={{ marginTop: 14 }} data-testid="wizard-translation">
          <h3>{t('wizard_translation_title', 'Translation sidecar')}</h3>
          {Object.entries(translation.locales).map(([locale, fields]) => (
            <p key={locale}>
              <strong>{locale.toUpperCase()}</strong>:{' '}
              {translation.fields
                .map((field) => `${field} ${fields[field] ? '✓' : '✗'}`)
                .join(' · ')}
            </p>
          ))}
          {translation.complete ? (
            <p style={{ color: palette.success }}>
              {t('wizard_translation_complete', 'Every localized field is filled.')}
            </p>
          ) : (
            <p style={{ color: palette.warn }}>
              {t(
                'wizard_translation_gaps',
                'Some localized fields are missing — finish them before submitting.',
              )}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
