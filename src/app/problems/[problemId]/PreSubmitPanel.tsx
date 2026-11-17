'use client';

// [wave E items 8/9/10] Pre-submit assistance on the problem page:
// - "Check code" — the static lint (rule warnings, RO/EN by locale),
//   including the constraint-aware int-overflow reading;
// - "Run samples" — the dress rehearsal: compile once, run every sample
//   test with the judge's comparison mode, verdicts per sample. Costs no
//   submission (the submit throttle stays the scarce resource).

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PreSubmitService } from '@/services/ApiService';
import type { PreSubmitWarning, SampleRunResult } from '@/services/ApiService';
import { palette, hexAlpha } from '@/theme/tokens';

const VERDICT_COLORS: Record<string, string> = {
  AC: palette.success,
  WA: palette.danger,
  TLE: palette.warn,
  RE: palette.danger,
  CE: palette.orange,
};

export default function PreSubmitPanel({
  problemId,
  language,
  code,
}: {
  problemId: string;
  language: string;
  code: string;
}): ReactNode {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState<'lint' | 'samples' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<PreSubmitWarning[] | null>(null);
  const [samples, setSamples] = useState<SampleRunResult[] | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);

  const localeMessage = (w: PreSubmitWarning): string =>
    i18n.language.startsWith('ro') ? w.message_ro : w.message_en;

  const runLint = async () => {
    setBusy('lint');
    setError(null);
    setSamples(null);
    setCompileError(null);
    try {
      const data = await PreSubmitService.lint(problemId, language, code);
      setWarnings(data.warnings);
    } catch (err) {
      setWarnings(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const runSamples = async () => {
    setBusy('samples');
    setError(null);
    setWarnings(null);
    try {
      const data = await PreSubmitService.runSamples(problemId, language, code);
      setCompileError(data.compile_error);
      setSamples(data.samples);
    } catch (err) {
      setSamples(null);
      setCompileError(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const disabled = busy !== null || !code.trim() || !language;

  return (
    <div style={{ marginTop: '0.75rem' }} data-testid="presubmit-panel">
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn"
          onClick={runLint}
          disabled={disabled}
          data-testid="presubmit-lint-button"
        >
          {busy === 'lint'
            ? t('presubmit_running', 'Checking…')
            : t('presubmit_check', 'Check code')}
        </button>
        <button
          type="button"
          className="btn"
          onClick={runSamples}
          disabled={disabled}
          data-testid="presubmit-samples-button"
        >
          {busy === 'samples'
            ? t('presubmit_running', 'Checking…')
            : t('presubmit_run_samples', 'Run samples')}
        </button>
      </div>

      {error && (
        <p style={{ color: palette.danger, fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</p>
      )}

      {warnings !== null && (
        <div style={{ marginTop: '0.5rem' }} data-testid="presubmit-warnings">
          <div className="micro-label">
            {t('presubmit_warnings', 'Pre-submit checks ({{n}})', { n: warnings.length })}
          </div>
          {warnings.length === 0 ? (
            <p style={{ color: palette.success, fontSize: '0.85rem', margin: '4px 0' }}>
              {t(
                'presubmit_no_warnings',
                'No warnings — nothing obvious standing between you and a submission.',
              )}
            </p>
          ) : (
            <ul style={{ margin: '4px 0 0', paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
              {warnings.map((w) => (
                <li
                  key={`${w.rule}-${w.line}`}
                  style={{
                    marginBottom: '4px',
                    color: w.severity === 'warning' ? palette.warn : 'var(--foreground)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      background: hexAlpha(palette.warn, 0.12),
                      padding: '0 6px',
                      borderRadius: '4px',
                      fontSize: '0.78rem',
                    }}
                  >
                    L{w.line}
                  </span>{' '}
                  {localeMessage(w)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {compileError !== null && compileError !== undefined && compileError !== '' && (
        <pre
          data-testid="presubmit-compile-error"
          style={{
            marginTop: '0.5rem',
            background: 'var(--surface-2)',
            padding: '10px',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            color: palette.danger,
            whiteSpace: 'pre-wrap',
          }}
        >
          {compileError}
        </pre>
      )}

      {samples !== null && samples.length > 0 && (
        <div style={{ marginTop: '0.5rem' }} data-testid="presubmit-samples">
          <div className="micro-label">
            {t('presubmit_samples', 'Sample results ({{n}})', { n: samples.length })}
          </div>
          <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
            {samples.map((s) => {
              const color = VERDICT_COLORS[s.verdict] ?? palette.muted;
              const failed = s.verdict !== 'AC';
              return (
                <li
                  key={s.test_id}
                  data-testid={`presubmit-sample-${s.order}`}
                  style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'baseline',
                    fontSize: '0.85rem',
                    padding: '4px 0',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color,
                      minWidth: '42px',
                    }}
                  >
                    {s.verdict}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)' }}>#{s.order}</span>
                  {s.time_ms !== null && s.time_ms !== undefined && (
                    <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                      {s.time_ms} ms
                    </span>
                  )}
                  {failed && s.mismatch_hint && (
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>
                      {s.mismatch_hint}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
