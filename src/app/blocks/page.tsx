'use client';

// [judge-fairness wave D] Free block playground: build blocks, see the
// generated Python/JavaScript, and RUN the generated code through the
// existing /api/v1/scratch/ endpoint (X7 custom invocation — the same
// sandboxed judge path, fixed limits, no submission).

import React, { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from 'next/dynamic';
import type { BlockGenerator } from '@/components/blocks/BlockEditor';
import { ScratchService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import { palette } from '@/theme/tokens';

// Blockly requires the DOM — load the editor client-side only.
const BlockEditor = dynamic(
  () => import('@/components/blocks/BlockEditor'),
  { ssr: false, loading: () => <BlocksSkeleton /> }
);

function BlocksSkeleton() {
  return (
    <div
      data-testid="blocks-skeleton"
      style={{ height: 420, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      aria-hidden="true"
    />
  );
}

export default function BlocksPlaygroundPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [generator, setGenerator] = useState<BlockGenerator>('python3');
  const [code, setCode] = useState('');
  const [stdin, setStdin] = useState('');
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const runGenerated = async () => {
    setRunError(null);
    if (!auth.isAuthenticated) {
      setRunError(t('blocks_auth_needed', 'Sign in to run your blocks.'));
      return;
    }
    if (!code.trim()) {
      setRunError(t('blocks_no_code', 'Add some blocks first.'));
      return;
    }
    setRunning(true);
    setOutput(null);
    try {
      const result = await ScratchService.run({
        language: generator,
        code,
        input: stdin,
      });
      setOutput(result.output ?? '');
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: 980, padding: '1.5rem 1rem 3rem' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
        {t('blocks_playground_title', 'Block playground')}
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: '0.4rem' }}>
        {t('blocks_playground_subtitle', 'Build a program with blocks — it generates real Python or JavaScript and runs on the judge.')}
      </p>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', margin: '1rem 0' }}>
        <label htmlFor="block_generator" className="micro-label">
          {t('blocks_generator_label', 'Generates')}
        </label>
        <select
          id="block_generator"
          value={generator}
          onChange={(e) => setGenerator(e.target.value as BlockGenerator)}
          style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
        >
          <option value="python3">Python 3</option>
          <option value="nodejs20">JavaScript (Node.js 20)</option>
        </select>
      </div>

      <Suspense fallback={<BlocksSkeleton />}>
        <BlockEditor generator={generator} onCodeChange={setCode} />
      </Suspense>

      <div style={{ display: 'grid', gap: '10px', marginTop: '1rem', gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <label htmlFor="block_stdin" className="micro-label">
          {t('blocks_stdin_label', 'Input (stdin)')}
        </label>
        <textarea
          id="block_stdin"
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
          rows={3}
          placeholder="42"
          style={{ padding: '10px', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--foreground)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}
        />
        <div>
          <button
            type="button"
            className="btn"
            onClick={runGenerated}
            disabled={running}
            style={{ opacity: running ? 0.6 : 1 }}
          >
            {running ? t('blocks_running', 'Running…') : t('blocks_run', 'Run on the judge')}
          </button>
        </div>
        {runError && (
          <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
            {runError}
          </p>
        )}
        {output !== null && (
          <div>
            <span className="micro-label">{t('blocks_output_label', 'Output')}</span>
            <pre
              data-testid="blocks-output"
              style={{
                marginTop: '6px',
                padding: '12px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem',
                whiteSpace: 'pre-wrap',
              }}
            >
{output}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
