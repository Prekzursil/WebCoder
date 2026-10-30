// [roadmap JDG-9] Published toolchain docs: the exact languages, compile
// and run commands and limits the judge uses. The data comes from the
// public /api/v1/public/languages/ endpoint — the same LanguageSpec
// registry the sandbox runs — so this page can never drift from the
// judge (the campion precedent: publish the compilers).

'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PublicService } from '@/services/ApiService';
import type { LanguageRow } from '@/types/api';

/**
 * Client-rendered on purpose: the registry is read through the app's
 * standard API lane (apiFetch) — the same fetch every page uses — so
 * the docs table and the sandbox share one source of truth without a
 * server-side fetch of the build-time API base.
 */
export default function JudgeHelpPage() {
  const { t } = useTranslation();
  const [languages, setLanguages] = useState<LanguageRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    PublicService.getLanguages()
      .then((data) => {
        if (!cancelled) setLanguages(data.results ?? []);
      })
      .catch(() => {
        if (!cancelled) setLanguages([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page-container" style={{ paddingTop: '2.5rem', maxWidth: '860px' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--foreground)' }}>
        {t('judge_docs_title', 'The judge: languages & limits')}
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0.5rem 0 1rem', lineHeight: 1.7 }}>
        {t(
          'judge_docs_intro',
          'Every submission runs isolated in a sandbox with no network access, a per-language time/memory budget and per-test evaluation. The table below is the live language registry — the exact toolchains the judge runs, not documentation that can drift.'
        )}
      </p>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0 0 2rem', lineHeight: 1.7 }}>
        {t(
          'judge_docs_limits',
          'Time limits are per test and multiplied per language (for example Python gets 3x, Java 2x and a memory floor); output is capped; runtime errors are reported with their signal. Problems may override the defaults — the effective limit is shown on each problem page for your selected language.'
        )}
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--border-strong)' }}>
                {t('judge_docs_language', 'Language')}
              </th>
              <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--border-strong)' }}>
                {t('judge_docs_compile', 'Compile')}
              </th>
              <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--border-strong)' }}>
                {t('judge_docs_run', 'Run')}
              </th>
            </tr>
          </thead>
          <tbody>
            {languages.map((row) => (
              <tr key={row.id}>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)', color: 'var(--foreground)' }}>
                  {row.name}
                  <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>{row.id}</div>
                </td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--muted)' }}>
                    {row.compile_command.join(' ') ||
                      t('judge_docs_interpreted', 'interpreted — no compile step')}
                  </code>
                </td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--muted)' }}>
                    {row.run_command.join(' ')}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginTop: '1rem' }}>
        {t('judge_docs_api_note', 'Machine-readable: GET /api/v1/public/languages/ (60 req/min).')}
      </p>
    </div>
  );
}
