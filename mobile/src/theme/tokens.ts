// Design tokens — verbatim port of the web app's src/theme/tokens.ts
// palette (owner rule: reuse the web design tokens). Only the RN-useful
// subset is carried: colors + type scale + spacing + rating bands.
export const palette = {
  /** App background. */
  bg: "#0f172a",
  /** Card / panel background. */
  surface: "#1e293b",
  /** Raised surface (code blocks, inset wells). */
  surface2: "#334155",
  /** Hairline border on dark surfaces. */
  border: "rgba(255, 255, 255, 0.08)",
  /** Emphasized border (focus rings). */
  borderStrong: "rgba(255, 255, 255, 0.12)",

  /** Primary text. */
  foreground: "#f1f5f9",
  /** Statement / long-form body text. */
  body: "#cbd5e1",
  /** Secondary text (labels, captions). */
  muted: "#94a3b8",
  /** Tertiary micro-label text. */
  textTertiary: "#8b9cb6",

  /** Brand accent (links, primary actions). */
  accent: "#38bdf8",
  accentHover: "#7dd3fc",
  /** Ink used on accent-colored fills. */
  onAccent: "#0f172a",

  danger: "#f87171",
  success: "#4ade80",
  warn: "#fbbf24",
  /** Tag / language-chip color. */
  violet: "#a78bfa",
  violetSoft: "#818cf8",
  orange: "#fb923c",
  pink: "#f472b6",
  blue: "#3b82f6",
} as const;

/** RAT-3 rating-band colors — mirrors the web tokens SSOT. */
export const RATING_BAND_COLORS: { min: number; color: string }[] = [
  { min: 2300, color: "#8b0000" },
  { min: 2100, color: "#cc0000" },
  { min: 1900, color: "#ff6600" },
  { min: 1600, color: "#aa00aa" },
  { min: 1400, color: "#0000ff" },
  { min: 1200, color: "#008000" },
  { min: 0, color: "#808080" },
];

/** Handle color for a rating value (lowest band ≥ rating wins). */
export function ratingColor(rating: number | null | undefined): string {
  if (rating === null || rating === undefined) return palette.muted;
  const band = RATING_BAND_COLORS.find((b) => rating >= b.min);
  return band ? band.color : palette.muted;
}

/** Font sizes (pt) — compact mobile type ramp derived from the web ramp. */
export const font = {
  title: 22,
  sectionTitle: 17,
  body: 15,
  caption: 13,
  micro: 11,
} as const;

/** 4px-base spacing scale. */
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

export const radius = { sm: 6, md: 8, lg: 12, pill: 999 } as const;
