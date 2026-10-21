import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssVars, palette } from './tokens';

// [SPEC-GAPS A2/A3] Token SSOT enforcement:
//  1. globals.css :root must declare exactly the cssVars from tokens.ts —
//     the CSS layer can never silently drift from the TS source of truth.
//  2. Every token used as text on the card surface must clear the WCAG AA
//     contrast floor of 4.5:1 (the old #64748b = 3.07:1 and #475569 = 1.93:1
//     failed; the audit measured those exact pairs).

// vitest runs with cwd at the project root; import.meta.url is not a file:
// URL under the vite module runner, so resolve from cwd instead.
const globalsCss = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

function parseRootVars(css: string): Record<string, string> {
  const rootBlock = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
  const vars: Record<string, string> = {};
  for (const line of rootBlock.split(';')) {
    const match = line.match(/(--[\w-]+)\s*:\s*(.+)/);
    if (match) {
      vars[match[1].trim()] = match[2].trim();
    }
  }
  return vars;
}

function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: string, bg: string): number {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('globals.css mirrors tokens.ts (CSS var parity)', () => {
  it('declares every cssVars entry with exactly the token value', () => {
    const rootVars = parseRootVars(globalsCss);
    for (const [name, value] of Object.entries(cssVars)) {
      expect(rootVars[name], `globals.css var ${name}`).toBe(value);
    }
  });

  it('declares no CSS vars unknown to tokens.ts', () => {
    const rootVars = parseRootVars(globalsCss);
    for (const name of Object.keys(rootVars)) {
      expect(cssVars[name], `unexpected var ${name} in globals.css`).toBeDefined();
    }
  });

  it('pins dark color-scheme on :root (native controls render dark)', () => {
    expect(globalsCss).toMatch(/:root\s*\{[^}]*color-scheme:\s*dark/);
  });
});

describe('WCAG AA contrast floor for text tokens [A3]', () => {
  const textTokens: Record<string, string> = {
    foreground: palette.foreground,
    body: palette.body,
    muted: palette.muted,
    textTertiary: palette.textTertiary,
    accent: palette.accent,
    danger: palette.danger,
    success: palette.success,
    warn: palette.warn,
    violet: palette.violet,
  };

  it.each(Object.entries(textTokens))(
    '%s clears 4.5:1 on the card surface',
    (_name, value) => {
      expect(contrastRatio(value, palette.surface)).toBeGreaterThanOrEqual(4.5);
    }
  );

  it.each(Object.entries(textTokens))(
    '%s clears 4.5:1 on the page background',
    (_name, value) => {
      expect(contrastRatio(value, palette.bg)).toBeGreaterThanOrEqual(4.5);
    }
  );

  it('retired the failing colors (#64748b / #475569 are not text tokens)', () => {
    expect(Object.values(textTokens)).not.toContain('#64748b');
    expect(Object.values(textTokens)).not.toContain('#475569');
  });
});
