/**
 * Centralized API configuration.
 *
 * NEXT_PUBLIC_API_BASE is set per-environment:
 *   - Local dev:   .env.local  → http://localhost:8000
 *   - Staging:     .env.staging → https://api-staging.webcoder.example.com
 *   - Production:  .env.production → https://api.webcoder.example.com
 *
 * The variable is prefixed NEXT_PUBLIC_ so it is inlined at build time
 * and available in both server components and client components.
 */

/**
 * Normalize the env-provided API base to a validated absolute http(s)
 * origin (scheme://host[:port]).
 *
 * NEXT_PUBLIC_API_BASE is deploy-time configuration, not user input, but
 * it IS env-derived, which every fetch()/href call site downstream of it
 * inherits. Parsing it through the URL constructor validates the scheme
 * and collapses the value to its origin; a malformed or non-http(s)
 * value falls back to the documented local default instead of reaching
 * any call site. Same-origin proxy precedent: classroom export route
 * (EDU-6 CodeQL fix).
 */
function normalizeApiBase(raw: string | undefined): string {
  const candidate = raw ?? "http://localhost:8000";
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`unsupported API base protocol: ${parsed.protocol}`);
    }
    return parsed.origin;
  } catch (err) {
    console.error(
      `[api-config] invalid NEXT_PUBLIC_API_BASE ${JSON.stringify(candidate)}; falling back to http://localhost:8000`,
      err,
    );
    return "http://localhost:8000";
  }
}

/** Base URL of the backend API server (validated origin, no trailing slash). */
export const API_BASE_URL: string = normalizeApiBase(process.env.NEXT_PUBLIC_API_BASE);

/** Full base for all /api/v1 endpoints. */
export const API_V1_URL: string = `${API_BASE_URL}/api/v1`;

/** Current environment label for debugging / feature flags. */
export const APP_ENV: string = process.env.NEXT_PUBLIC_ENV ?? "development";

/**
 * Build a full API URL for a given v1 path.
 * @example apiUrl('/problems/problems/') → 'http://localhost:8000/api/v1/problems/problems/'
 */
export function apiUrl(path: string): string {
  return `${API_V1_URL}${path}`;
}
