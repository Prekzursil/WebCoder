'use client';

// [Wave G item 94] The feature tour: a first-visit spotlight walk over the
// four anchors a newcomer must find (brand/home, search, problems,
// contests, the /start path). Hand-rolled spotlight — a full-viewport
// overlay with a transparent "hole" over the anchor's bounding box (four
// shaded divs, no clip-path dependency), a step card with Back/Next/Skip,
// Esc-to-exit, and a localStorage dismissal so it never nags.

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export const TOUR_STORAGE_KEY = 'wc-feature-tour-done';

interface Step {
  selector: string;
  titleKey: string;
  titleDefault: string;
  bodyKey: string;
  bodyDefault: string;
}

const STEPS: Step[] = [
  {
    selector: '[data-tour="brand"]',
    titleKey: 'tour_step_welcome_title',
    titleDefault: 'Welcome to WebCoder',
    bodyKey: 'tour_step_welcome_body',
    bodyDefault:
      'A bilingual (RO/EN) competitive programming judge with classrooms, contests and a sandboxed evaluator. This 30-second tour shows you around.',
  },
  {
    selector: '[data-tour="search"]',
    titleKey: 'tour_step_search_title',
    titleDefault: 'Find problems fast',
    bodyKey: 'tour_step_search_body',
    bodyDefault:
      'Press / to jump into search, or Ctrl K anywhere for the command palette — navigation and problem search in one place.',
  },
  {
    selector: '[data-tour="problems"]',
    titleKey: 'tour_step_problems_title',
    titleDefault: 'The problem catalog',
    bodyKey: 'tour_step_problems_body',
    bodyDefault:
      'Curriculum-mapped problems with hints, editorials and instant judging. Filter by grade, chapter, tag or difficulty.',
  },
  {
    selector: '[data-tour="contests"]',
    titleKey: 'tour_step_contests_title',
    titleDefault: 'Rated contests',
    bodyKey: 'tour_step_contests_body',
    bodyDefault:
      'Weekly-style contests with ratings, scoreboards and a calendar feed. Teachers can run private class contests too.',
  },
  {
    selector: '[data-tour="start"]',
    titleKey: 'tour_step_start_title',
    titleDefault: 'Start with three classics',
    bodyKey: 'tour_step_start_body',
    bodyDefault:
      'The /start path picks one easy problem per paradigm — your first accepted submission is three clicks away.',
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function FeatureTour(): ReactNode {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(TOUR_STORAGE_KEY) === '1') return;
    } catch {
      return;
    }
    // Small delay so the navbar/layout settles before measuring anchors.
    const handle = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(handle);
  }, []);

  const finish = useCallback(() => {
    setVisible(false);
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, '1');
    } catch {
      /* private mode: skip persistence, the tour just ends */
    }
  }, []);

  const step = STEPS[index];

  // Measure the anchor on every step + on resize/scroll while open.
  useLayoutEffect(() => {
    if (!visible) return;
    const measure = () => {
      const node = document.querySelector(step.selector);
      if (!node) {
        setRect(null);
        return;
      }
      const box = node.getBoundingClientRect();
      setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [visible, step]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, finish]);

  const pad = 8;
  const hole = useMemo(() => {
    if (!rect) return null;
    return {
      top: Math.max(rect.top - pad, 0),
      left: Math.max(rect.left - pad, 0),
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    };
  }, [rect]);

  if (!visible) return null;

  const shade = 'rgba(2, 6, 23, 0.72)';
  const cardBelow =
    hole === null || hole.top + hole.height + 230 < window.innerHeight;

  return (
    <div>
      {/* Four shaded panes around the spotlight hole (no clip-path). */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 250, pointerEvents: 'auto' }}>
        <div style={{ position: 'absolute', inset: 0, background: shade }} />
        {hole && (
          <div
            style={{
              position: 'absolute',
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
              borderRadius: 10,
              boxShadow: '0 0 0 4px var(--accent)',
              outline: '9999px solid transparent',
              background: 'transparent',
            }}
          />
        )}
      </div>
      {/* Step card */}
      <div
        data-testid="feature-tour"
        role="dialog"
        aria-modal="true"
        aria-label={t('tour_title', 'Feature tour')}
        style={{
          position: 'fixed',
          zIndex: 260,
          width: 'min(400px, calc(100vw - 2rem))',
          ...(hole
            ? cardBelow
              ? { top: hole.top + hole.height + 16, left: Math.max(hole.left, 16) }
              : { top: Math.max(hole.top - 230, 16), left: Math.max(hole.left, 16) }
            : { top: '30%', left: '50%', transform: 'translateX(-50%)' }),
          background: 'var(--surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.1rem',
        }}
      >
        <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: 4 }}>
          {t('tour_progress', 'Step {{current}} of {{total}}', {
            current: index + 1,
            total: STEPS.length,
          })}
        </div>
        <strong style={{ display: 'block', fontSize: '1rem', color: 'var(--foreground)', marginBottom: 6 }}>
          {t(step.titleKey, step.titleDefault)}
        </strong>
        <p style={{ fontSize: '0.875rem', color: 'var(--body)', lineHeight: 1.6, margin: 0 }}>
          {t(step.bodyKey, step.bodyDefault)}
        </p>
        <div style={{ display: 'flex', gap: '8px', marginTop: '1rem', alignItems: 'center' }}>
          <button type="button" className="btn" onClick={finish}>
            {t('tour_skip', 'Skip tour')}
          </button>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            {index > 0 && (
              <button
                type="button"
                className="btn"
                onClick={() => setIndex((i) => Math.max(i - 1, 0))}
              >
                {t('tour_back', 'Back')}
              </button>
            )}
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                if (index === STEPS.length - 1) {
                  finish();
                  // A plain navigation keeps the tour mountable outside the
                  // app-router context (unit tests render pages directly).
                  window.location.assign('/start');
                } else {
                  setIndex((i) => Math.min(i + 1, STEPS.length - 1));
                }
              }}
            >
              {index === STEPS.length - 1 ? t('tour_done', 'Start solving') : t('tour_next', 'Next')}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
