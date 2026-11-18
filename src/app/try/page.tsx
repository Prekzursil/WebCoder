'use client';

// [Wave G item 89] Guest try-it: the zero-friction first run. A visitor
// with no account opens /try, edits starter code in the real CodeMirror
// editor and runs it through the sandboxed judge via the anonymous
// guest endpoint (IP-throttled, tight caps). The page ends with the
// sign-up CTA — the natural next step once the code runs.

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import CodeEditor from '@/app/problems/[problemId]/CodeEditor';
import { ScratchService } from '@/services/ApiService';

const STARTERS: Record<string, string> = {
  python3: 'name = input("")\nprint(f"Salut, {name}!")\n',
  cpp17: [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    '',
    'int main() {',
    '    string name;',
    '    getline(cin, name);',
    '    cout << "Salut, " << name << "!" << endl;',
    '    return 0;',
    '}',
    '',
  ].join('\n'),
};

const LANGUAGES = [
  { id: 'python3', label: 'Python 3' },
  { id: 'cpp17', label: 'C++17' },
];

interface GuestResult {
  status: string;
  output: string;
  error: string;
  time_ms?: number;
  memory_kb?: number;
}

export default function TryItPage(): ReactNode {
  const { t } = useTranslation();
  const [language, setLanguage] = useState('python3');
  const [code, setCode] = useState(STARTERS.python3);
  const [stdin, setStdin] = useState('world');
  const [result, setResult] = useState<GuestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLanguageChange = (next: string) => {
    setLanguage(next);
    setCode(STARTERS[next] ?? '');
  };

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await ScratchService.runGuest({ language, code, input: stdin });
      setResult(data);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 429) {
        setError(t('try_throttled', 'Guest runs are limited — create a free account for more.'));
      } else {
        setError(t('try_failed', 'The run failed. Try again in a moment.'));
      }
    } finally {
      setBusy(false);
    }
  };

  const verdictLabel = useMemo(() => {
    if (!result) return '';
    if (result.status === 'OK') return t('try_status_ok', 'Ran successfully');
    if (result.status === 'COMPILE_ERROR') return t('try_status_ce', 'Compile error');
    if (result.status === 'TIMEOUT') return t('try_status_tle', 'Time limit');
    return t('try_status_re', 'Runtime error');
  }, [result, t]);

  return (
    <div className="page-container" data-testid="try-page">
      <h1 style={{ fontSize: '1.75rem', color: 'var(--foreground)', marginBottom: '0.5rem' }}>
        {t('try_guest_title', 'Try WebCoder — no account needed')}
      </h1>
      <p style={{ color: 'var(--body)', marginBottom: '1.5rem', maxWidth: 640 }}>
        {t(
          'try_guest_subtitle',
          'Write a program, run it on the same sandboxed judge every submission uses, and see the verdict. This is the whole loop — sign up when you want problems, contests and classrooms.',
        )}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        <div className="card" style={{ padding: '1rem' }}>
          <div
            style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '0.75rem' }}
          >
            <label className="micro-label" htmlFor="try-language" style={{ color: 'var(--muted)' }}>
              {t('language_label', 'Language')}
            </label>
            <select
              id="try-language"
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              style={{ flex: 0, minWidth: 130 }}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn--primary"
              onClick={run}
              disabled={busy}
              style={{ marginLeft: 'auto' }}
              data-testid="try-run"
            >
              {busy ? t('try_running', 'Running…') : t('try_run', 'Run code')}
            </button>
          </div>
          <CodeEditor
            value={code}
            onChange={setCode}
            language={language}
            ariaLabel={t('try_editor_label', 'Guest code editor')}
            height="300px"
          />
          <div style={{ marginTop: '0.75rem' }}>
            <label
              className="micro-label"
              htmlFor="try-stdin"
              style={{ color: 'var(--muted)', display: 'block', marginBottom: 4 }}
            >
              {t('try_stdin_label', 'Input (stdin)')}
            </label>
            <textarea
              id="try-stdin"
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              rows={2}
              style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
            />
          </div>
        </div>

        <div className="card" data-testid="try-result">
          <div className="micro-label" style={{ color: 'var(--muted)', marginBottom: '0.5rem' }}>
            {t('try_output_header', 'Output')}
          </div>
          {error && (
            <p style={{ color: 'var(--danger)', fontSize: '0.875rem' }} role="alert">
              {error}
            </p>
          )}
          {result ? (
            <>
              <p
                style={{
                  color: result.status === 'OK' ? 'var(--success)' : 'var(--danger)',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                }}
                data-testid="try-verdict"
              >
                {verdictLabel}
              </p>
              {(result.output || result.error) && (
                <pre
                  style={{
                    background: 'var(--surface-2)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 12px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    color: 'var(--foreground)',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {result.status === 'COMPILE_ERROR' ? result.error : result.output}
                </pre>
              )}
              {result.status === 'OK' && (
                <p style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: 8 }}>
                  {t('try_stats', '{{ms}} ms · {{kb}} KB', {
                    ms: result.time_ms ?? '—',
                    kb: result.memory_kb ?? '—',
                  })}
                </p>
              )}
            </>
          ) : (
            !error && (
              <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
                {t('try_placeholder', 'Press Run code to execute on the sandboxed judge.')}
              </p>
            )
          )}
          <div
            style={{
              marginTop: '1.25rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <Link href="/register" className="btn btn--primary">
              {t('try_signup_cta', 'Create a free account')}
            </Link>
            <Link href="/start" className="btn">
              {t('try_start_cta', 'Guided first solve')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
