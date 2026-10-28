/**
 * Safe-anchor guard for CodeQL js/xss + client-side-unvalidated-url-redirection.
 *
 * The export URL derives from NEXT_PUBLIC_API_BASE (a build-time env var
 * CodeQL treats as attacker-influenced). Every anchor that points at the
 * API must pass through here: only absolute http(s) URLs whose origin
 * matches the configured API origin are returned unchanged; anything else
 * (protocol-relative, javascript:, other hosts) collapses to '#', so a
 * poisoned env value can never turn a download link into a redirect or
 * script vector.
 */
import { API_V1_URL } from './api-config';

const API_ORIGIN = (() => {
  try {
    return new URL(API_V1_URL).origin;
  } catch {
    return '';
  }
})();

export function safeApiHref(candidate: string | undefined | null): string {
  if (!candidate || !API_ORIGIN) return '#';
  try {
    const parsed = new URL(candidate, API_V1_URL);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '#';
    if (parsed.origin !== API_ORIGIN) return '#';
    return parsed.toString();
  } catch {
    return '#';
  }
}
