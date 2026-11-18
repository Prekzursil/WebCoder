// Design tokens — the single source of truth (SSOT) for the WebCoder visual
// language: colors, typography ramp, radii, spacing.
//
// Consumers:
//  - globals.css mirrors these values as CSS custom properties on :root
//    (`var(--accent)` etc.). src/theme/tokens.test.ts parses globals.css and
//    FAILS if the two drift apart.
//  - src/app/providers.tsx builds the MUI createTheme() palette/typography
//    from the same objects — no literal colors in the theme file.
//  - TSX components that cannot use CSS vars (e.g. composing alpha washes)
//    import `palette` / `hexAlpha` from here instead of writing raw hex.
//
// Contrast floors (WCAG AA, verified in tokens.test.ts): every token used as
// text on --surface (#1e293b) must reach 4.5:1. That is why the old
// #64748b (3.07:1) and #475569 (1.93:1) text colors are gone from the system:
// --muted is raised to #94a3b8 (5.71:1) and --text-tertiary is #8b9cb6
// (5.24:1). [SPEC-GAPS A3]

export const palette = {
  /** App background. */
  bg: '#0f172a',
  /** Card / panel background. */
  surface: '#1e293b',
  /** Raised surface (code blocks, inset wells, scrollbars). */
  surface2: '#334155',
  /** Hairline border on dark surfaces. */
  border: 'rgba(255, 255, 255, 0.08)',
  /** Emphasized border (hover states, ghost buttons). */
  borderStrong: 'rgba(255, 255, 255, 0.12)',

  /** Primary text. */
  foreground: '#f1f5f9',
  /** Statement / long-form body text. */
  body: '#cbd5e1',
  /** Secondary text (labels, captions) — AA on surface. */
  muted: '#94a3b8',
  /** Tertiary micro-label text — AA on surface. */
  textTertiary: '#8b9cb6',

  /** Brand accent (links, primary actions, focus ring). */
  accent: '#38bdf8',
  accentHover: '#7dd3fc',
  /** Ink used on accent-colored fills. */
  onAccent: '#0f172a',

  danger: '#f87171',
  success: '#4ade80',
  warn: '#fbbf24',
  /** Tag / language-chip color. */
  violet: '#a78bfa',
  violetSoft: '#818cf8',
  orange: '#fb923c',
  pink: '#f472b6',
  blue: '#3b82f6',

  /** Navbar logo / brand mark gradient. [SPEC-GAPS A2: dedicated token] */
  brandGradient: 'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)',

  /**
   * Surface "washes" — translucent ink overlays for hover states, button
   * fills and row hovers. Dark mode washes are white-based; light mode
   * (lightPalette below) flips them to dark-based. Extracted as tokens so
   * the globals.css idioms could leave hardcoded rgba() behind (item 79:
   * a real light theme, not a half-one).
   */
  wash4: 'rgba(255, 255, 255, 0.04)',
  wash5: 'rgba(255, 255, 255, 0.05)',
  wash6: 'rgba(255, 255, 255, 0.06)',
  wash14: 'rgba(255, 255, 255, 0.14)',
  wash24: 'rgba(255, 255, 255, 0.24)',
  ink70: 'rgba(255, 255, 255, 0.7)',
  ink85: 'rgba(255, 255, 255, 0.85)',
} as const;

/**
 * Light palette (wave G item 79 — full dark mode ships WITH its light
 * counterpart so the toggle is honest). Values chosen for WCAG AA on
 * white/near-white surfaces; mirrors the html[data-theme='light'] block
 * in globals.css.
 */
export const lightPalette = {
  bg: '#f1f5f9',
  surface: '#ffffff',
  surface2: '#e2e8f0',
  border: 'rgba(15, 23, 42, 0.1)',
  borderStrong: 'rgba(15, 23, 42, 0.16)',

  foreground: '#0f172a',
  body: '#1e293b',
  muted: '#475569',
  textTertiary: '#52607a',

  accent: '#0369a1',
  accentHover: '#075985',
  onAccent: '#ffffff',

  danger: '#b91c1c',
  success: '#15803d',
  warn: '#a16207',
  violet: '#6d28d9',
  violetSoft: '#4f46e5',
  orange: '#c2410c',
  pink: '#be185d',
  blue: '#1d4ed8',

  brandGradient: 'linear-gradient(135deg, #0369a1 0%, #4f46e5 100%)',

  wash4: 'rgba(15, 23, 42, 0.04)',
  wash5: 'rgba(15, 23, 42, 0.05)',
  wash6: 'rgba(15, 23, 42, 0.06)',
  wash14: 'rgba(15, 23, 42, 0.12)',
  wash24: 'rgba(15, 23, 42, 0.2)',
  ink70: 'rgba(15, 23, 42, 0.7)',
  ink85: 'rgba(15, 23, 42, 0.85)',
} as const;

/** RAT-3 rating-band colors (Wave B): mirrors backend
 * ratings/glicko.RATING_BANDS — the SSOT for handle colors everywhere
 * (UserChip on standings, the ratings ladder, leaderboards). */
export const RATING_BAND_COLORS: { min: number; color: string }[] = [
  { min: 2300, color: '#8b0000' },
  { min: 2100, color: '#cc0000' },
  { min: 1900, color: '#ff6600' },
  { min: 1600, color: '#aa00aa' },
  { min: 1400, color: '#0000ff' },
  { min: 1200, color: '#008000' },
  { min: 0, color: '#808080' },
];

export const fontFamily = {
  sans: "'DM Sans', 'Manrope', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
} as const;

/** Shared type ramp — end of copy-pasted ad-hoc page titles. [SPEC-GAPS A12] */
export const typeRamp = {
  pageTitle: {
    fontSize: '1.75rem',
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  sectionTitle: {
    fontSize: '1.25rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  /** Uppercase card section headers ("PROBLEM STATEMENT"). */
  sectionLabel: {
    fontSize: '0.8rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
  },
  /** Tiny uppercase stat labels ("TIME LIMIT"). */
  microLabel: {
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

/** 4px-base spacing scale (px values). */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  12: 48,
} as const;

/**
 * CSS custom properties injected on :root in globals.css. tokens.test.ts
 * asserts globals.css declares exactly these names with exactly these values.
 */
export const cssVars: Record<string, string> = {
  '--background': palette.bg,
  '--foreground': palette.foreground,
  '--surface': palette.surface,
  '--surface-2': palette.surface2,
  '--border': palette.border,
  '--border-strong': palette.borderStrong,
  '--body': palette.body,
  '--muted': palette.muted,
  '--text-tertiary': palette.textTertiary,
  '--accent': palette.accent,
  '--accent-hover': palette.accentHover,
  '--on-accent': palette.onAccent,
  '--danger': palette.danger,
  '--success': palette.success,
  '--warn': palette.warn,
  '--violet': palette.violet,
  '--orange': palette.orange,
  '--pink': palette.pink,
  '--blue': palette.blue,
  '--brand-gradient': palette.brandGradient,
  '--wash-4': palette.wash4,
  '--wash-5': palette.wash5,
  '--wash-6': palette.wash6,
  '--wash-14': palette.wash14,
  '--wash-24': palette.wash24,
  '--ink-70': palette.ink70,
  '--ink-85': palette.ink85,
  '--font-sans': fontFamily.sans,
  '--font-mono': fontFamily.mono,
  '--radius-sm': `${radius.sm}px`,
  '--radius-md': `${radius.md}px`,
  '--radius-lg': `${radius.lg}px`,
};

/** Append an alpha channel to a #rrggbb token: hexAlpha('#38bdf8', 0.12) → '#38bdf81f'. */
export function hexAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`hexAlpha expects a #rrggbb token, got: ${hex}`);
  }
  const a = Math.round(Math.min(Math.max(alpha, 0), 1) * 255);
  return `${hex}${a.toString(16).padStart(2, '0')}`;
}
