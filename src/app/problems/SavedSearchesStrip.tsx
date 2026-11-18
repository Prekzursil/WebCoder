'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ProblemService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import { palette } from '@/theme/tokens';

/**
 * Item 129 — the saved-searches strip for the catalog: save the current
 * filter set under a name, re-apply it in one click, delete it.
 */

interface SavedSearchRow {
  id: number;
  name: string;
  params: Record<string, string | string[]>;
}

export default function SavedSearchesStrip({
  currentParams,
}: {
  currentParams: Record<string, string>;
}) {
  const { t } = useTranslation();
  const auth = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<SavedSearchRow[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await ProblemService.listSavedSearches();
      setRows(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    }
  }, []);

  useEffect(() => {
    if (auth.isAuthenticated) load();
  }, [auth.isAuthenticated, load]);

  if (!auth.isAuthenticated) return null;

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await ProblemService.saveSavedSearch(name.trim(), currentParams);
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  const apply = (params: Record<string, string | string[]>) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      qs.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
    router.push(`/problems?${qs.toString()}`);
  };

  const remove = async (id: number) => {
    setBusy(true);
    try {
      await ProblemService.deleteSavedSearch(id);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="saved-searches" style={{ marginBottom: 12 }}>
      {error && (
        <p role="alert" style={{ color: palette.danger }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('saved_search_name', 'Name this filter set…')}
          aria-label={t('saved_search_name', 'Name this filter set…')}
          style={{ padding: '6px 10px' }}
          data-testid="saved-search-name"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy || !name.trim()}
          data-testid="saved-search-save"
        >
          {t('saved_search_save', 'Save search')}
        </button>
        {rows?.map((row) => (
          <span
            key={row.id}
            style={{
              border: `1px solid ${palette.border}`,
              borderRadius: 999,
              padding: '2px 10px',
              fontSize: '0.85rem',
              display: 'inline-flex',
              gap: 6,
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={() => apply(row.params)}
              data-testid={`saved-search-apply-${row.id}`}
              style={{
                background: 'none',
                border: 'none',
                color: palette.accent,
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              {row.name}
            </button>
            <button
              type="button"
              onClick={() => remove(row.id)}
              aria-label={t('saved_search_delete', 'Delete')}
              data-testid={`saved-search-delete-${row.id}`}
              style={{
                background: 'none',
                border: 'none',
                color: palette.muted,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
