'use client';

// [Wave G item 75] Split-view layout: a toggle on the problem page that
// widens the submit column to a 50/50 side-by-side with the statement
// (each pane scrolling independently — the LeetCode statement|editor
// affordance) instead of the default narrow sticky sidebar. The page is
// a server component, so the toggle finds its [data-detail-grid]
// ancestor and flips a data-split attribute; detail.module.css owns the
// geometry (CSS-module class names are mangled, hence the marker attr).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import ViewColumnOutlinedIcon from '@mui/icons-material/ViewColumnOutlined';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';

const STORAGE_KEY = 'wc-split-view';

export default function SplitViewToggle(): ReactNode {
  const { t } = useTranslation();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [split, setSplit] = useState(false);

  const apply = useCallback((on: boolean) => {
    const grid = btnRef.current?.closest<HTMLElement>('[data-detail-grid]');
    if (grid) grid.setAttribute('data-split', on ? 'on' : 'off');
    try {
      window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch {
      /* private mode: attribute-only for this visit */
    }
  }, []);

  useEffect(() => {
    let stored = false;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      stored = false;
    }
    setSplit(stored);
    apply(stored);
  }, [apply]);

  return (
    <button
      ref={btnRef}
      type="button"
      data-testid="split-view-toggle"
      className="btn"
      aria-pressed={split}
      onClick={() => {
        const next = !split;
        setSplit(next);
        apply(next);
      }}
      style={{ fontSize: '0.75rem', minHeight: '30px', padding: '4px 10px' }}
    >
      {split ? (
        <ViewAgendaOutlinedIcon fontSize="small" />
      ) : (
        <ViewColumnOutlinedIcon fontSize="small" />
      )}
      <span style={{ marginLeft: 6 }}>
        {split ? t('split_view_off', 'Stacked view') : t('split_view_on', 'Split view')}
      </span>
    </button>
  );
}
