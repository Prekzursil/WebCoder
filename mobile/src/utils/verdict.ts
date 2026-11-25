// Verdict + formatting helpers — mobile port of the web's shared
// verdict→color map (src/app/submissions/[submissionId]/page.tsx) plus
// the OLE verdict the backend added (JDG-7).
import { palette } from '../theme/tokens';

export const VERDICT_COLORS: Record<string, string> = {
  AC: palette.success,
  WA: palette.danger,
  TLE: palette.warn,
  MLE: palette.warn,
  OLE: palette.warn,
  CE: palette.orange,
  RE: palette.danger,
  IE: palette.danger,
  PENDING: palette.muted,
  COMPILING: palette.muted,
  RUNNING: palette.accent,
};

/** Catalog key for a verdict's localized label (verdict_* in every locale). */
export function verdictLabelKey(verdict: string): string {
  const key = verdict.toLowerCase();
  return `verdict_${key}`;
}

/** Verdict pill color (muted for unknown values — web parity). */
export function verdictColor(verdict: string | undefined): string {
  return (verdict && VERDICT_COLORS[verdict]) || palette.muted;
}

/** Verdicts that mean the judge has not finished — the polling predicate. */
export function verdictInProgress(verdict: string | undefined): boolean {
  return verdict === 'PENDING' || verdict === 'COMPILING' || verdict === 'RUNNING';
}

/** "2.4 s" / "850 ms" duration form. */
export function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)} s` : `${ms} ms`;
}

/** "12 MB" / "900 KB" memory form. */
export function formatKb(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(kb % 1024 === 0 ? 0 : 1)} MB` : `${kb} KB`;
}

/** Locale-safe short date-time (2026-11-02 14:03). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Polling backoff for verdict polling: 1s x5, then 2s (web parity). */
export function pollDelayMs(attempt: number): number {
  return attempt < 5 ? 1000 : 2000;
}
