// [Q1 → i18n wave] TEN-LOCALE parity sweep: every static `t('key', …)`
// callsite under src must resolve in ALL TEN locale catalogs
// (src/locales/*.json), and all ten catalogs must carry identical key sets
// (an en-only or ro-only key is a bug even when the other locales silently
// fall back).
//
// Method (mirrors the audit in docs/BENCH-i18n-gaps.md, mechanized so CI
// catches regressions instead of a one-off grep):
//   1. regex-scan every .ts/.tsx under src (excluding *.test.* and the
//      i18n modules themselves) for `t('key'` / `t("key"` / t(`key` calls;
//   2. compare against every locale catalog (flattened, dot-paths for the
//      nested admin_dashboard/errors namespaces);
//   3. repeat for the server-side dictionary (public-messages.ts MESSAGES,
//      derived from the same catalogs) — parity is by construction, so the
//      assertions pin the derivation against regressions;
//   4. assert the dynamic key families used with template literals
//      (report_reason_*, verdict_*, faq_q*/faq_a*, start_step_*) exist
//      explicitly — the regex sweep cannot see those callsites;
//   5. quality gates against machine-translation rot: every non-EN locale
//      must differ from the EN value on the overwhelming majority of keys
//      (a few exact matches are legitimate: brand names, code enum chips);
//      the public/locales/*.json mobile copies must match the catalogs.
//
// Dynamic callsites (first arg not a string literal) are counted but not
// extracted; the families they resolve into are pinned by the explicit
// assertions above so they cannot silently raw-render.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import i18n, { SUPPORTED_LOCALES, type Locale } from './i18n';
import { MESSAGES, PUBLIC_LOCALES, PUBLIC_KEYS } from './app/_lib/public-messages';

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

// Flatten nested namespaces (the catalogs carry `admin_dashboard.*` /
// `errors.*` as nested objects; i18next resolves them with dot paths).
function flatKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return prefix ? [prefix] : [];
  return Object.entries(obj).flatMap(([k, v]) =>
    flatKeys(v, prefix ? `${prefix}.${k}` : k)
  );
}

const LOCALE_KEYS: Record<Locale, string[]> = Object.fromEntries(
  SUPPORTED_LOCALES.map((code) => [code, flatKeys(i18n.getResourceBundle(code, 'translation'))])
) as Record<Locale, string[]>;
const LOCALE_SETS: Record<Locale, Set<string>> = Object.fromEntries(
  SUPPORTED_LOCALES.map((code) => [code, new Set(LOCALE_KEYS[code])])
) as Record<Locale, Set<string>>;

// The i18n module + dictionaries themselves legitimately mention keys
// without calling t(); exclude them from the callsite sweep.
const scanned = listSourceFiles(SRC_ROOT).filter(
  (f) => !/[\\/]i18n\.ts$|[\\/]public-messages\.ts$|[\\/]public-i18n\.ts$/.test(f)
);
const { keys: callsites, dynamic } = scanCallsites(scanned);

function t(key: string, lng: Locale): string {
  return String(i18n.t(key, { lng } as never));
}

describe('i18n parity sweep [Q1 × ten locales]', () => {
  it('ships exactly the ten agreed locales', () => {
    // English mandatory + home market + globals; no RTL locale without RTL
    // layout (decision record in backend/webcoder_api/languages.py).
    expect([...SUPPORTED_LOCALES]).toEqual([
      'en', 'ro', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'pl', 'uk',
    ]);
    expect(PUBLIC_LOCALES).toEqual(SUPPORTED_LOCALES);
  });

  it('every locale catalog carries an identical key set', () => {
    const enKeys = LOCALE_KEYS.en;
    expect(enKeys.length).toBeGreaterThan(1000); // the full catalog, not a stub
    for (const code of SUPPORTED_LOCALES) {
      if (code === 'en') continue;
      const onlyInEn = enKeys.filter((k) => !LOCALE_SETS[code].has(k));
      const onlyInLocale = LOCALE_KEYS[code].filter((k) => !LOCALE_SETS.en.has(k));
      expect(onlyInEn, `keys only in en (missing from ${code})`).toEqual([]);
      expect(onlyInLocale, `keys only in ${code}`).toEqual([]);
    }
  });

  it('every static t(key) callsite under src resolves in ALL locales', () => {
    expect(scanned.length).toBeGreaterThan(50); // sweep actually scanned the tree
    const missing: string[] = [];
    for (const [key, files] of callsites) {
      for (const code of SUPPORTED_LOCALES) {
        if (!LOCALE_SETS[code].has(key)) {
          missing.push(`${key} missing from ${code} (used in ${files.join(', ')})`);
        }
      }
    }
    expect(missing, `keys missing from a locale catalog:\n${missing.join('\n')}`).toEqual([]);
  });

  it('dynamic t() callsites are covered by explicit key families', () => {
    // The sweep cannot extract template-literal keys; pin every family that
    // uses them so the count above cannot regress into raw-render territory
    // unnoticed. (forum report reasons, judge verdicts, home FAQ, /start.)
    expect(dynamic).toBeGreaterThan(0); // the dynamic detector still matches
    for (const code of SUPPORTED_LOCALES) {
      for (const r of ['spam', 'abuse', 'off_topic', 'inappropriate', 'other']) {
        expect(LOCALE_SETS[code].has(`report_reason_${r}`), `report_reason_${r} in ${code}`).toBe(true);
      }
      for (const v of ['ac', 'wa', 'tle', 'mle', 'ce', 're']) {
        expect(LOCALE_SETS[code].has(`verdict_${v}`), `verdict_${v} in ${code}`).toBe(true);
      }
      for (const step of ['pick', 'code', 'judged']) {
        for (const part of ['label', 'title', 'body']) {
          const key = `start_step_${step}_${part}`;
          expect(LOCALE_SETS[code].has(key), `${key} in ${code}`).toBe(true);
        }
      }
      for (const q of [1, 2, 3, 4]) {
        expect(LOCALE_SETS[code].has(`faq_q${q}`), `faq_q${q} in ${code}`).toBe(true);
        expect(LOCALE_SETS[code].has(`faq_a${q}`), `faq_a${q} in ${code}`).toBe(true);
      }
    }
  });

  it('no locale is an untranslated clone of English (machine-translation rot gate)', () => {
    // Short enum-ish chips (OK/ID/C++), brand names and bare numerals are
    // legitimately identical across languages; a real localization differs
    // on the overwhelming majority of strings. Cognate-heavy languages (de,
    // pt) still differ far more often than not.
    const ignorable = (value: string) => value.length <= 3;
    for (const code of SUPPORTED_LOCALES) {
      if (code === 'en') continue;
      let total = 0;
      let identical = 0;
      for (const key of LOCALE_KEYS.en) {
        const enValue = t(key, 'en');
        const value = t(key, code);
        if (typeof enValue !== 'string' || typeof value !== 'string') continue;
        if (ignorable(enValue)) continue;
        total += 1;
        if (value === enValue) identical += 1;
      }
      expect(total).toBeGreaterThan(500);
      // Allow a small cognate budget; fail whole-catalog copy-paste.
      expect(
        identical / total,
        `${code}: ${(100 * (identical / total)).toFixed(1)}% of strings are identical to English`
      ).toBeLessThan(0.12);
    }
  });

  it('server dictionary (MESSAGES) derives from the catalogs in all ten locales', () => {
    for (const code of SUPPORTED_LOCALES) {
      const dict = MESSAGES[code];
      const expectedKeys = PUBLIC_KEYS.filter((k) => typeof t(k, 'en') === 'string');
      expect(Object.keys(dict).sort()).toEqual([...expectedKeys].sort());
      // Values mirror the catalog exactly (derivation, not a copy that can drift).
      for (const key of expectedKeys) {
        expect(dict[key], `${code}:${key} mirrors the catalog`).toBe(t(key, code));
      }
    }
  });

  it('server pages only use keys the public dictionary knows', () => {
    // The createTranslator flow has no inline-default safety outside the
    // given default — a missing MESSAGES entry renders the English default
    // even for other locales. Scan server page files (page.tsx under
    // src/app without 'use client') for t('key' calls and require MESSAGES
    // coverage.
    const serverPages = scanned.filter(
      (f) => /[\\/]page\.tsx$/.test(f) && !readFileSync(f, 'utf8').startsWith("'use client'")
    );
    const { keys: serverKeys } = scanCallsites(serverPages);
    const missing: string[] = [];
    for (const [key, files] of serverKeys) {
      const known = SUPPORTED_LOCALES.every((code) => key in MESSAGES[code]);
      if (!known) {
        missing.push(`${key} (used in ${files.join(', ')})`);
      }
    }
    expect(missing, `server-page keys missing from MESSAGES:\n${missing.join('\n')}`).toEqual([]);
  });

  it('mobile copies under public/locales match the catalogs byte-for-byte', () => {
    // The later mobile phase consumes the same catalogs from
    // public/locales/*.json (scripts/export-locales.mjs copies them); a
    // stale copy fails here, never in the app store.
    for (const code of SUPPORTED_LOCALES) {
      const path = join(process.cwd(), 'public', 'locales', `${code}.json`);
      expect(existsSync(path), `${path} exists (run scripts/export-locales.mjs)`).toBe(true);
      const copy = JSON.parse(readFileSync(path, 'utf8'));
      const catalog = i18n.getResourceBundle(code, 'translation');
      expect(copy).toEqual(catalog);
    }
  });
});
