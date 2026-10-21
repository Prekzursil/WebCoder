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

/** Base URL of the backend API server (no trailing slash). */
export const API_BASE_URL: string =
  process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';

/** Full base for all /api/v1 endpoints. */
export const API_V1_URL: string = `${API_BASE_URL}/api/v1`;

/** Current environment label for debugging / feature flags. */
export const APP_ENV: string = process.env.NEXT_PUBLIC_ENV ?? 'development';

/**
 * Build a full API URL for a given v1 path.
 * @example apiUrl('/problems/problems/') → 'http://localhost:8000/api/v1/problems/problems/'
 */
export function apiUrl(path: string): string {
  return `${API_V1_URL}${path}`;
}
