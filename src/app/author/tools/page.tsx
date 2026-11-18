'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProblemService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import { palette } from '@/theme/tokens';
import PageHeader from '@/components/common/PageHeader';

/**
 * Items 122/126/128 — the author tools: the testcase-generator DSL runner,
 * variant-family spawning/browsing and statement attachments, all against
 * one selected draft problem.
 */

interface VariantRow {
  id: number;
  title: string;
  note: string;
  status: string;
}

interface AttachmentRow {
  id: number;
  name: string;
  kind: string;
  size_bytes: number;
  url: string;
}

const SAMPLE_DSL = 'n = int(1, 100)\nq = int(1, 20)\nprint {n} {q}';

export default function AuthorToolsPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [problemId, setProblemId] = useState('');
  const [dsl, setDsl] = useState(SAMPLE_DSL);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [variants, setVariants] = useState<VariantRow[] | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);

  const isAuthor = ['PROBLEM_CREATOR', 'PROBLEM_VERIFIER', 'TEACHER', 'ADMIN'].includes(
    auth.user?.role ?? '',
  );

  const load = useCallback(async () => {
    if (!problemId) {
      setVariants(null);
      setAttachments(null);
      return;
    }
    const id = Number(problemId);
    try {
      const [family, files] = await Promise.all([
        ProblemService.listVariants(id).catch(() => null),
        ProblemService.listAttachments(id).catch(() => null),
      ]);
      setVariants(family ? family.variants : null);
      setAttachments(files ? files.results : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    }
  }, [problemId]);

  useEffect(() => {
    if (isAuthor) load();
  }, [isAuthor, load]);

  const generateTests = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await ProblemService.generateTests(Number(problemId), dsl);
      setMessage(
        t('gen_created', 'Created {{count}} tests; first input: {{first}}', {
          count: response.created,
          first: response.first,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  const spawnVariant = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await ProblemService.spawnVariant(Number(problemId));
      setMessage(t('variant_spawned', 'Variant #{{id}} created', { id: response.variant_id }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  const uploadAttachment = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await ProblemService.uploadAttachment(Number(problemId), fileName);
      setMessage(t('attachment_uploaded', 'Uploaded {{name}}', { name: response.name }));
      setFileName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!isAuthor) {
    return (
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
        <PageHeader title={t('tools_title', 'Author tools')} />
        <p style={{ color: palette.muted }}>
          {t('tools_creators_only', 'These tools are for problem creators and verifiers.')}
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader
        title={t('tools_title', 'Author tools')}
        subtitle={t(
          'tools_subtitle',
          'Test generators, variant families and statement attachments.',
        )}
      />
      <input
        value={problemId}
        onChange={(e) => setProblemId(e.target.value)}
        placeholder={t('wizard_problem_id', 'Draft problem id (optional)')}
        aria-label={t('wizard_problem_id', 'Draft problem id (optional)')}
        style={{ width: 260, padding: 8, marginBottom: 12 }}
        data-testid="tools-problem-input"
      />
      {error && (
        <p role="alert" style={{ color: palette.danger }}>
          {error}
        </p>
      )}
      {message && (
        <p data-testid="tools-message" style={{ color: palette.success }}>
          {message}
        </p>
      )}

      <section data-testid="tools-generator" style={{ marginBottom: 20 }}>
        <h3>{t('gen_title', 'Testcase generator (DSL)')}</h3>
        <textarea
          value={dsl}
          onChange={(e) => setDsl(e.target.value)}
          rows={5}
          style={{ width: '100%', padding: 8, marginBottom: 8 }}
          data-testid="tools-dsl-input"
        />
        <button
          type="button"
          onClick={generateTests}
          disabled={busy || !problemId || !dsl.trim()}
          data-testid="tools-generate"
        >
          {t('gen_run', 'Generate tests')}
        </button>
      </section>

      <section data-testid="tools-variants" style={{ marginBottom: 20 }}>
        <h3>{t('variants_title', 'Variant family')}</h3>
        <button
          type="button"
          onClick={spawnVariant}
          disabled={busy || !problemId}
          data-testid="tools-spawn-variant"
        >
          {t('variants_spawn', 'Spawn variant')}
        </button>
        {variants === null ? null : variants.length === 0 ? (
          <p style={{ color: palette.muted }}>{t('variants_empty', 'No variants yet.')}</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {variants.map((row) => (
              <li key={row.id} data-testid={`variant-row-${row.id}`}>
                #{row.id} {row.title}
                {row.note ? ` — ${row.note}` : ''} ({row.status})
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="tools-attachments">
        <h3>{t('attachments_title', 'Statement attachments')}</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="figure.png"
            aria-label={t('attachments_name', 'File name')}
            style={{ padding: 8 }}
            data-testid="tools-attachment-name"
          />
          <button
            type="button"
            onClick={uploadAttachment}
            disabled={busy || !problemId || !fileName.trim()}
            data-testid="tools-attachment-upload"
          >
            {t('attachments_upload', 'Upload')}
          </button>
        </div>
        {attachments === null ? null : attachments.length === 0 ? (
          <p style={{ color: palette.muted }}>{t('attachments_empty', 'No attachments yet.')}</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {attachments.map((row) => (
              <li key={row.id} data-testid={`attachment-row-${row.id}`}>
                {row.name} · {row.kind} · {row.size_bytes} B
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
