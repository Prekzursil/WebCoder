// [Q1] RO/EN parity sweep: every static `t('key', …)` callsite under src
// must resolve in BOTH locale blocks of src/i18n.ts, and the two blocks
// must carry identical key sets (an en-only or ro-only key is a bug even
// when the other locale silently falls back to the inline default).
//
// Method (mirrors the audit in docs/BENCH-i18n-gaps.md, now mechanized so
// CI catches regressions instead of a one-off grep):
//   1. regex-scan every .ts/.tsx under src (excluding *.test.* and the
//      i18n modules themselves) for `t('key'` / `t("key"` / `t(`key`` calls;
//   2. compare against i18n.getResource('en'|'ro', 'translation');
//   3. repeat for the server-side dictionary (public-messages.ts MESSAGES)
//      via createTranslator-produced `t('key'` callsites;
//   4. assert the dynamic key families used with template literals
//      (report_reason_*, verdict_*, faq_q*/faq_a*) exist explicitly — the
//      regex sweep cannot see those callsites.
//
// Dynamic callsites (first arg not a string literal) are counted but not
// extracted; the families they resolve into are pinned by the explicit
// assertions above so they cannot silently raw-render.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import i18n from './i18n';
import { MESSAGES, type PublicLocale } from './app/_lib/public-messages';

// jsdom gives import.meta.url an http scheme — resolve from the project cwd
// (vitest always runs with cwd = package root) instead.
const SRC_ROOT = join(process.cwd(), 'src');

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Extract static t('key') callsites + count dynamic (non-literal) ones. */
function scanCallsites(files: string[]): { keys: Map<string, string[]>; dynamic: number } {
  const keys = new Map<string, string[]>();
  let dynamic = 0;
  // t('key' / t("key" / t(`key` — i18next default export or useTranslation.
  const staticRe = /\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
  // t(someVar / t(`prefix${…}` — cannot be resolved statically.
  const dynamicRe = /\bt\(\s*[^'"`]/g;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = staticRe.exec(text)) !== null) {
      const list = keys.get(m[2]) ?? [];
      list.push(relative(SRC_ROOT, file).replace(/\\/g, '/'));
      keys.set(m[2], list);
    }
    while ((m = dynamicRe.exec(text)) !== null) {
      dynamic += 1;
    }
  }
  return { keys, dynamic };
}

// Flatten nested namespaces (i18n.ts carries `admin_dashboard.*` / `errors.*`
// as nested objects; i18next resolves them with dot paths).
function flatKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return prefix ? [prefix] : [];
  return Object.entries(obj).flatMap(([k, v]) =>
    flatKeys(v, prefix ? `${prefix}.${k}` : k)
  );
}
const enKeys = flatKeys(i18n.getResourceBundle('en', 'translation'));
const roKeys = flatKeys(i18n.getResourceBundle('ro', 'translation'));
const enSet = new Set(enKeys);
const roSet = new Set(roKeys);

// The i18n module + dictionaries themselves legitimately mention keys
// without calling t(); exclude them from the callsite sweep.
const scanned = listSourceFiles(SRC_ROOT).filter(
  (f) => !/[\\/]i18n\.ts$|[\\/]public-messages\.ts$|[\\/]public-i18n\.ts$/.test(f)
);
const { keys: callsites, dynamic } = scanCallsites(scanned);

describe('i18n parity sweep [Q1]', () => {
  it('en and ro resource blocks carry identical key sets', () => {
    const enOnly = enKeys.filter((k) => !roSet.has(k));
    const roOnly = roKeys.filter((k) => !enSet.has(k));
    expect(enOnly, 'keys only in en').toEqual([]);
    expect(roOnly, 'keys only in ro').toEqual([]);
  });

  it('every static t(key) callsite under src resolves in BOTH locales', () => {
    expect(scanned.length).toBeGreaterThan(50); // sweep actually scanned the tree
    const missing: string[] = [];
    for (const [key, files] of callsites) {
      if (!enSet.has(key) || !roSet.has(key)) {
        missing.push(`${key} (used in ${files.join(', ')})`);
      }
    }
    expect(missing, `keys missing from a locale block:\n${missing.join('\n')}`).toEqual([]);
  });

  it('dynamic t() callsites are covered by explicit key families', () => {
    // The sweep cannot extract template-literal keys; pin every family that
    // uses them so the count above cannot regress into raw-render territory
    // unnoticed. (forum report reasons, judge verdicts, home FAQ.)
    expect(dynamic).toBeGreaterThan(0); // the dynamic detector still matches
    for (const r of ['spam', 'abuse', 'off_topic', 'inappropriate', 'other']) {
      expect(enSet.has(`report_reason_${r}`), `report_reason_${r} in en`).toBe(true);
      expect(roSet.has(`report_reason_${r}`), `report_reason_${r} in ro`).toBe(true);
    }
    for (const v of ['ac', 'wa', 'tle', 'mle', 'ce', 're']) {
      expect(enSet.has(`verdict_${v}`), `verdict_${v} in en`).toBe(true);
      expect(roSet.has(`verdict_${v}`), `verdict_${v} in ro`).toBe(true);
    }
    // [roadmap ONB-1] /start step strip renders start_step_${key}_${part}
    // through a template literal.
    for (const step of ['pick', 'code', 'judged']) {
      for (const part of ['label', 'title', 'body']) {
        const key = `start_step_${step}_${part}`;
        expect(enSet.has(key), `${key} in en`).toBe(true);
        expect(roSet.has(key), `${key} in ro`).toBe(true);
      }
    }
  });

  it('public server dictionary (MESSAGES) has en/ro parity and mirrors i18n resources', () => {
    const pubEn = Object.keys(MESSAGES.en);
    const pubRo = Object.keys(MESSAGES.ro);
    expect(pubEn.filter((k) => !(k in MESSAGES.ro)), 'MESSAGES keys only in en').toEqual([]);
    expect(pubRo.filter((k) => !(k in MESSAGES.en)), 'MESSAGES keys only in ro').toEqual([]);
    // Every server-rendered key must also live in the client resources so
    // hydrated output cannot switch languages mid-page.
    const notInI18n = pubEn.filter((k) => !enSet.has(k));
    expect(notInI18n, 'MESSAGES keys absent from i18n resources').toEqual([]);
  });

  it('new [Q2]/[Q4] key families return real Romanian (not English clones)', () => {
    // Guards against copy-paste en==ro entries in the new pages' families.
    const families = [
      'leaderboard_header', 'leaderboard_subtitle', 'leaderboard_your_rank',
      'notifications_header', 'notification_filter_reply', 'notification_mark_read',
      'forum_header', 'forum_new_thread', 'forum_post_reply', 'forum_started_by',
      'submission_history_header', 'history_stat_total', 'history_all_verdicts',
      'home_badge', 'faq_heading', 'faq_q1', 'verdict_ac', 'load_older_submissions',
    ];
    const clones = families.filter((k) => {
      const en = i18n.t(k, { lng: 'en' } as never);
      const ro = i18n.t(k, { lng: 'ro' } as never);
      return !ro || ro === en;
    });
    expect(clones, 'keys whose ro value equals the en value').toEqual([]);
  });

  it('server pages only use keys the public dictionary knows', () => {
    // The createTranslator flow has no inline-default safety outside the
    // given default — a missing MESSAGES entry renders the English default
    // even for ro. Scan server page files (page.tsx under src/app without
    // 'use client') for t('key' calls and require MESSAGES coverage.
    const serverPages = scanned.filter(
      (f) => /[\\/]page\.tsx$/.test(f) && !readFileSync(f, 'utf8').startsWith("'use client'")
    );
    const { keys: serverKeys } = scanCallsites(serverPages);
    const missing: string[] = [];
    for (const [key, files] of serverKeys) {
      if (!(key in MESSAGES.en) || !(key in (MESSAGES as Record<PublicLocale, Record<string, string>>).ro)) {
        missing.push(`${key} (used in ${files.join(', ')})`);
      }
    }
    expect(missing, `server-page keys missing from MESSAGES:\n${missing.join('\n')}`).toEqual([]);
  });
});
