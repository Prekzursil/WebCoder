'use client';

// Propose-form client half: language picker fed by the translatable
// catalog, the EN original shown alongside (the "prefilled from the EN
// source" affordance), and the authenticated POST. Errors are mapped to
// the catalog's dedicated keys (login required / duplicate pending /
// language already published) with the API detail kept visible.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { TranslationsService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import { palette } from '@/theme/tokens';

const CARD: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '1.5rem',
  marginBottom: '1.25rem',
};

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 700,
  color: 'var(--muted)',
  marginBottom: '0.4rem',
};

const FIELD: React.CSSProperties = {
  width: '100%',
  padding: '0.55rem 0.75rem',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: '0.9rem',
};

export default function TranslateForm({
  problemId,
  englishTitle,
  englishStatement,
  existingLanguages,
}: {
  problemId: number;
  englishTitle: string;
  englishStatement: string;
  existingLanguages: string[];
}) {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, isHydrated } = useAuth();
  const [languages, setLanguages] = useState<{ code: string; endonym: string; english: string }[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [language, setLanguage] = useState('');
  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<{ kind: 'login' | 'duplicate' | 'unavailable' | 'generic'; detail: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    TranslationsService.getLanguages()
      .then((response) => {
        if (!cancelled) setLanguages(response.results);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A language that already has a published translation cannot be proposed
  // again (the backend rejects it); offer the rest, preselecting the
  // viewer's own UI locale when it is available.
  const options = useMemo(
    () => languages.filter((entry) => !existingLanguages.includes(entry.code)),
    [languages, existingLanguages]
  );

  useEffect(() => {
    if (!language && options.length > 0) {
      const current = (i18n.resolvedLanguage || i18n.language || 'en').toLowerCase();
      const match = options.find(
        (entry) => current === entry.code.toLowerCase()
          || current.startsWith(`${entry.code.toLowerCase()}-`)
      );
      setLanguage((match ?? options[0]).code);
    }
  }, [options, language, i18n]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!language) {
      setError({ kind: 'generic', detail: t('error_select_language', 'Select a language.') });
      return;
    }
    setSubmitting(true);
    try {
      await TranslationsService.propose({ problemId, language, title, statement });
      setDone(true);
    } catch (err) {
      const detail = err instanceof Error ? err.message : '';
      if (/log in|authenticated|credential/i.test(detail) || /401/.test(detail)) {
        setError({ kind: 'login', detail });
      } else if (/pending proposal/i.test(detail)) {
        setError({ kind: 'duplicate', detail });
      } else if (/already (has|been)|approved translation/i.test(detail)) {
        setError({ kind: 'unavailable', detail });
      } else {
        setError({ kind: 'generic', detail });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div style={CARD} role="status" data-testid="translate-submitted">
        <h1 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          {t('translate_submitted', 'Thank you! Your translation was submitted and awaits review.')}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>
          <Link href="/translations" style={{ color: 'var(--accent)' }}>
            {t('translations_my_header', 'My translations')}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--foreground)', marginBottom: '0.4rem' }}>
          {t('translate_page_title', 'Translate this problem')}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>
          {t(
            'translate_intro',
            'Translate the English original into your language. A reviewer looks at every submission before it goes live — thank you for helping.'
          )}
        </p>
      </div>

      <div style={CARD}>
        <h2 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 0.75rem' }}>
          {t('translate_from_english', 'English original')}
        </h2>
        <p style={{ fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--foreground)' }}>{englishTitle}</p>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.9rem', color: 'var(--muted)' }}>
          {englishStatement}
        </p>
      </div>

      {isHydrated && !isAuthenticated ? (
        <div style={CARD} role="note">
          <p style={{ margin: 0, fontSize: '0.95rem' }}>
            {t('translate_login_hint', 'Log in to propose a translation.')}{' '}
            <Link href="/login" style={{ color: 'var(--accent)' }}>
              {t('login_link_text', 'Log in here')}
            </Link>
          </p>
        </div>
      ) : loadError ? (
        <div style={CARD} role="alert">
          <p style={{ margin: 0, color: palette.danger }}>{t('translations_load_error', 'Failed to load translation proposals.')}</p>
        </div>
      ) : options.length === 0 ? (
        <div style={CARD} role="note">
          <p style={{ margin: 0 }}>
            {t('translate_language_unavailable', 'There is already an approved translation for this language.')}
          </p>
        </div>
      ) : (
        <form style={CARD} onSubmit={onSubmit} noValidate>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="translate-language" style={LABEL}>
              {t('translate_language_label', 'Target language')}
            </label>
            <select
              id="translate-language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              style={FIELD}
            >
              {options.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.endonym} — {entry.english}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="translate-title" style={LABEL}>
              {t('translate_title_label', 'Translated title')}
            </label>
            <input
              id="translate-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              style={FIELD}
              maxLength={255}
              required
            />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="translate-statement" style={LABEL}>
              {t('translate_statement_label', 'Translated statement (markdown)')}
            </label>
            <textarea
              id="translate-statement"
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              style={{ ...FIELD, minHeight: '220px', fontFamily: 'var(--font-mono)', resize: 'vertical' }}
              required
            />
          </div>

          {error && (
            <p role="alert" style={{ color: palette.danger, fontSize: '0.9rem', margin: '0 0 1rem' }} data-testid="translate-error">
              {error.kind === 'login' && t('translate_login_hint', 'Log in to propose a translation.')}
              {error.kind === 'duplicate' && t(
                'translate_duplicate',
                'You already have a pending translation for this problem and language.'
              )}
              {error.kind === 'unavailable' && t(
                'translate_language_unavailable',
                'There is already an approved translation for this language.'
              )}
              {error.kind === 'generic' && (t('translate_error', 'Could not submit the translation.'))}
              {error.detail ? ` (${error.detail})` : ''}
            </p>
          )}

          <button type="submit" className="btn" disabled={submitting}>
            {submitting
              ? t('translate_submitting', 'Submitting…')
              : t('translate_submit', 'Submit translation')}
          </button>
        </form>
      )}
    </>
  );
}
