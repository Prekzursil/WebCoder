'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContestService } from '@/services/ApiService';
import { ContestCommentaryRow } from '@/types/api';
import { palette } from '@/theme/tokens';

/**
 * Item 56 — contest commentary: the organizer broadcast feed pinned to
 * minute offsets (the AtCoder-livestream pattern). Organizers post; anyone
 * who can see the contest reads.
 */
export default function CommentaryPanel({
  contestId,
  canManage,
}: {
  contestId: number;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ContestCommentaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const response = await ContestService.getCommentary(contestId);
      setRows(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    }
  }, [contestId]);

  useEffect(() => {
    load();
  }, [load]);

  // Light polling keeps the live feed fresh while the contest runs.
  useEffect(() => {
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const post = async () => {
    if (!text.trim()) return;
    setPosting(true);
    try {
      await ContestService.postCommentary(contestId, text.trim());
      setText('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div data-testid="contest-commentary">
      {canManage && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            placeholder={t('commentary_placeholder', 'Broadcast a note to followers…')}
            aria-label={t('commentary_placeholder', 'Broadcast a note to followers…')}
            style={{ flex: 1, minWidth: 240, padding: '8px 10px' }}
            data-testid="commentary-input"
          />
          <button
            type="button"
            onClick={post}
            disabled={posting || !text.trim()}
            data-testid="commentary-post"
          >
            {posting ? t('posting', 'Posting…') : t('commentary_post', 'Post')}
          </button>
        </div>
      )}
      {error && <p role="alert" style={{ color: palette.danger }}>{error}</p>}
      {rows === null ? (
        <p aria-busy="true">{t('commentary_loading', 'Loading commentary…')}</p>
      ) : rows.length === 0 ? (
        <p style={{ color: palette.muted }}>
          {t('commentary_empty', 'No commentary yet — organizers will broadcast notes here.')}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
          {rows.map((row) => (
            <li
              key={row.id}
              data-testid={`commentary-line-${row.id}`}
              style={{
                border: `1px solid ${palette.border}`,
                borderRadius: 10,
                padding: '10px 12px',
              }}
            >
              <span
                style={{
                  color: palette.accent,
                  fontWeight: 700,
                  fontSize: 13,
                  marginRight: 8,
                }}
              >
                +{row.minute_offset}m
              </span>
              <span style={{ color: palette.muted, fontSize: 13, marginRight: 8 }}>
                @{row.author_username}
              </span>
              <div>{row.text}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
