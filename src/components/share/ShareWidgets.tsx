'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CommunityService } from '@/services/ApiService';
import { EmbedProblem } from '@/types/api';
import { API_BASE_URL } from '@/lib/api-config';
import { palette } from '@/theme/tokens';

/**
 * Items 71-72 — the shareable surfaces:
 * - the shareable solve-card image URL (SVG) for a (user, problem) pair;
 * - the embeddable problem widget rendered from the public embed payload.
 */
export function SolveCardShare({ username, problemId }: { username: string; problemId: number }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const svgUrl = `${API_BASE_URL}/api/v1/users/cards/solve/${encodeURIComponent(
    username,
  )}/${problemId}/svg/`;
  return (
    <div data-testid="solve-card-share" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG card from the API */}
      <img
        src={svgUrl}
        alt={t('solve_card_alt', 'Solve card')}
        width={300}
        height={100}
        data-testid="solve-card-image"
      />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard?.writeText(svgUrl).catch(() => undefined);
          setCopied(true);
        }}
        data-testid="solve-card-copy"
      >
        {copied ? t('copied', 'Copied!') : t('copy_link', 'Copy link')}
      </button>
    </div>
  );
}

export function ProblemEmbedWidget({ problemId }: { problemId: number }) {
  const { t } = useTranslation();
  const [data, setData] = useState<EmbedProblem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    CommunityService.getEmbedProblem(problemId)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [problemId]);

  if (error) {
    return (
      <p data-testid="embed-error" style={{ color: palette.muted }}>
        {error}
      </p>
    );
  }
  if (!data) return <p aria-busy="true">{t('loading', 'Loading…')}</p>;
  return (
    <div
      data-testid="problem-embed"
      style={{
        border: `1px solid ${palette.border}`,
        borderRadius: 12,
        padding: 14,
        maxWidth: 480,
      }}
    >
      <strong style={{ fontSize: '1.05rem' }}>{data.title}</strong>
      <span style={{ color: palette.muted, marginLeft: 8, fontSize: '0.8rem' }}>
        {data.difficulty} · {data.time_limit_ms} ms · {Math.round(data.memory_limit_kb / 1024)} MB
      </span>
      <p style={{ color: palette.muted, fontSize: '0.85rem', margin: '6px 0' }}>
        {t('embed_solved_by', 'Solved by {{count}} users', { count: data.solved_by })}
      </p>
      <pre
        data-testid="embed-samples"
        style={{
          background: 'rgba(127,127,127,0.12)',
          padding: 10,
          borderRadius: 8,
          fontSize: '0.8rem',
          overflowX: 'auto',
        }}
      >
        {data.samples
          .map(
            (sample) =>
              `${t('embed_input', 'in')}:\n${sample.input_data}\n${t(
                'embed_output',
                'out',
              )}:\n${sample.expected_output_data}`,
          )
          .join('\n\n')}
      </pre>
      <a
        href={data.solve_url}
        style={{ color: palette.accent, fontWeight: 600 }}
        data-testid="embed-cta"
      >
        {t('embed_cta', 'Solve it on WebCoder →')}
      </a>
    </div>
  );
}
