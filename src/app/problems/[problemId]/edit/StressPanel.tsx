'use client';

// [wave E item 12] The stress-test helper's author surface: cross-check a
// solution against a brute-force reference on generator-produced inputs
// (the JDG-11 backend shipped in #307 — this gives it a UI beside the
// problem editor). The first mismatching input is shown verbatim so it
// can become a real TestCase with one copy.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StressService } from '@/services/ApiService';
import type { StressRunResponse } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import { palette, hexAlpha } from '@/theme/tokens';

export default function StressPanel({ language }: { language: string }): ReactNode {
  const { t } = useTranslation();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [generator, setGenerator] = useState('import random\nprint(random.randint(1, 100))\n');
  const [solution, setSolution] = useState('');
  const [reference, setReference] = useState('');
  const [iterations, setIterations] = useState(20);
  const [result, setResult] = useState<StressRunResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!auth.isAuthenticated) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await StressService.run({
        generator_language: 'python3',
        generator_code: generator,
        solution_language: language || 'python3',
        solution_code: solution,
        reference_language: 'python3',
        reference_code: reference,
        iterations,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: '90px',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '8px',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8rem',
    color: 'var(--foreground)',
  };

  return (
    <div style={{ marginTop: '1rem' }} data-testid="stress-panel">
      <button
        type="button"
        className="btn"
        onClick={() => setOpen((v) => !v)}
        data-testid="stress-toggle"
      >
        {open
          ? t('stress_hide', 'Hide the stress tester')
          : t('stress_show', 'Stress-test against a brute force')}
      </button>
      {open && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '1rem',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--surface)',
            display: 'grid',
            gap: '0.75rem',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
            {t(
              'stress_hint',
              'The generator produces random inputs; your solution and the reference run on each; the first mismatch is shown so it can become a real test.',
            )}
          </p>
          <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>
            {t('stress_generator', 'Generator (python3)')}
            <textarea
              value={generator}
              onChange={(e) => setGenerator(e.target.value)}
              style={{ ...textareaStyle, marginTop: '4px' }}
            />
          </label>
          <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>
            {t('stress_solution', 'Solution ({{lang}})', { lang: language || 'python3' })}
            <textarea
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              placeholder={t('stress_solution_placeholder', 'the code under test')}
              style={{ ...textareaStyle, marginTop: '4px' }}
            />
          </label>
          <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>
            {t('stress_reference', 'Reference (python3, trusted)')}
            <textarea
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t('stress_reference_placeholder', 'the brute force')}
              style={{ ...textareaStyle, marginTop: '4px' }}
            />
          </label>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>
              {t('stress_iterations', 'Iterations')}
              <input
                type="number"
                min={1}
                max={500}
                value={iterations}
                onChange={(e) => setIterations(parseInt(e.target.value, 10) || 1)}
                style={{ width: '80px', marginLeft: '8px' }}
              />
            </label>
            <button
              type="button"
              className="btn btn--primary"
              onClick={run}
              disabled={busy || !solution.trim() || !reference.trim()}
              data-testid="stress-run"
            >
              {busy ? t('presubmit_running', 'Checking…') : t('stress_run', 'Stress')}
            </button>
          </div>
          {error && <p style={{ color: palette.danger, fontSize: '0.8rem' }}>{error}</p>}
          {result && (
            <div data-testid="stress-result">
              {result.found && result.mismatch ? (
                <div
                  style={{
                    background: hexAlpha(palette.danger, 0.08),
                    border: `1px solid ${hexAlpha(palette.danger, 0.25)}`,
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px',
                  }}
                >
                  <strong style={{ color: palette.danger }}>
                    {result.mismatch.phase === 'mismatch'
                      ? t('stress_mismatch_found', 'Counterexample found:')
                      : `${result.mismatch.phase}: ${result.mismatch.verdict ?? ''}`}
                  </strong>
                  {result.mismatch.input && (
                    <pre
                      style={{
                        margin: '6px 0 0',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.78rem',
                      }}
                    >
                      {result.mismatch.input}
                    </pre>
                  )}
                  {result.mismatch.solution_output && (
                    <pre
                      style={{
                        margin: '4px 0 0',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.78rem',
                      }}
                    >
                      yours: {result.mismatch.solution_output}
                    </pre>
                  )}
                  {result.mismatch.reference_output && (
                    <pre
                      style={{
                        margin: '4px 0 0',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.78rem',
                      }}
                    >
                      ref: {result.mismatch.reference_output}
                    </pre>
                  )}
                </div>
              ) : (
                <p style={{ color: palette.success, fontSize: '0.85rem' }}>
                  {t(
                    'stress_no_mismatch',
                    'No mismatch in {{n}} iterations — the solution matches the reference on everything tried.',
                    { n: result.iterations ?? iterations },
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
