// HTTP core for the mobile app — the RN port of the web ApiService's
// fetch wrapper, adapted to the header-token lane the backend exposes for
// non-browser clients (verified against the live API on 2026-11-02):
//
//  - login sets httpOnly wc_access/wc_refresh cookies the RN fetch jar
//    keeps only imperfectly, so the app instead captures the `access`
//    token from the login BODY and the rotating `wc_refresh` cookie from
//    the Set-Cookie response headers, persisting both in SecureStore;
//  - every authenticated request carries `Authorization: Bearer <access>`
//    (backend/users/authentication.py: the header path is plain simplejwt
//    and CSRF-exempt — cookie-auth unsafe methods need X-CSRFToken, the
//    header path does not);
//  - on 401 the client POSTs /auth/token/refresh/ with {refresh} in the
//    body (dj-rest-auth's CookieTokenRefreshView accepts a body refresh;
//    verified live), reads the new access from the body and the ROTATED
//    refresh from Set-Cookie (rotation + blacklist means the previously
//    stored refresh is single-use), retries the original request once;
//  - refresh is single-flight: concurrent 401s await the same promise.
import { API_V1_URL } from "./config";
import type { CursorPaginatedResponse, PaginatedResponse } from "../types/api";
import { cursorParamFromUrl } from "../types/api";

const REFRESH_ENDPOINT = "/auth/token/refresh/";

/** Credential storage seam — expo-secure-store in production, injected in tests. */
export interface TokenStore {
  getAccess(): Promise<string | null>;
  setAccess(token: string | null): Promise<void>;
  getRefresh(): Promise<string | null>;
  setRefresh(token: string | null): Promise<void>;
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let tokenStore: TokenStore | null = null;

/** AuthStore registers its logout path here (mirrors the web service). */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

/** Install the credential storage (called once from AuthStore bootstrap). */
export function setTokenStore(store: TokenStore): void {
  tokenStore = store;
}

/**
 * Pull a named cookie value out of a fetch response's Set-Cookie headers.
 * React Native surfaces `set-cookie` as a comma-joined string (Android) or
 * an array (iOS/some polyfills) — both are handled. Returns null when the
 * cookie is absent.
 */
export function cookieFromResponse(
  response: {
    headers: {
      get?: (name: string) => string | string[] | null;
      map?: Record<string, string | string[]>;
    };
  },
  name: string,
): string | null {
  const get = response.headers.get?.bind(response.headers);
  let raw: string | string[] | null = null;
  if (get) {
    raw = get("set-cookie");
    // Some fetch impls return the array under headers.map only.
    if (raw === null && response.headers.map) {
      const mapValue = response.headers.map["set-cookie"] ?? response.headers.map["Set-Cookie"];
      raw = mapValue ?? null;
    }
  } else if (response.headers.map) {
    raw = response.headers.map["set-cookie"] ?? null;
  }
  if (!raw) return null;
  const parts: string[] = Array.isArray(raw)
    ? raw.flatMap((line) => line.split(/,(?=[^;]+?=)/))
    : raw.split(/,(?=[^;]+?=)/);
  for (const part of parts) {
    const match = part.match(new RegExp(`(?:^[\\s;]*|;\\s*)${name}=([^;]+)`));
    if (match) return match[1];
  }
  return null;
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  if (!tokenStore) return false;
  if (!refreshInFlight) {
    const attempt = (async () => {
      const refresh = await tokenStore!.getRefresh();
      if (!refresh) return false;
      try {
        // URL is module constants over the validated API origin; no user
        // input (mirrors the web ApiService triage, alerts #120-122,
        // 2026-10-27): the base collapses to URL.origin in config.ts and
        // the path segments are fixed string literals.
        // codeql[js/request-forgery]
        const response = await fetch(`${API_V1_URL}${REFRESH_ENDPOINT}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh }),
        });
        if (!response.ok) return false;
        const body = (await response.json().catch(() => ({}))) as {
          access?: string;
        };
        if (!body.access) return false;
        const rotatedRefresh = cookieFromResponse(response, "wc_refresh");
        await tokenStore!.setAccess(body.access);
        // Rotation blacklisted the presented refresh; a missing rotated
        // cookie means the session dies at the next access expiry — treat
        // the pair as broken and force re-login.
        if (rotatedRefresh) {
          await tokenStore!.setRefresh(rotatedRefresh);
        } else {
          await tokenStore!.setRefresh(null);
        }
        return Boolean(rotatedRefresh);
      } catch {
        return false;
      }
    })();
    refreshInFlight = attempt;
    const clear = () => {
      if (refreshInFlight === attempt) refreshInFlight = null;
    };
    attempt.then(clear, clear);
  }
  return refreshInFlight;
}

export interface ApiFetchOptions {
  method?: string;
  body?: string;
  /** Skip the Bearer header (login/register/refresh). */
  anonymous?: boolean;
}

/** Raw fetch with the Bearer header attached. */
async function authenticatedFetch(url: string, options: ApiFetchOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (!options.anonymous && tokenStore) {
    const access = await tokenStore.getAccess();
    if (access) headers["Authorization"] = `Bearer ${access}`;
  }
  // URL is module constants over the validated API origin; no user
  // input (mirrors the web ApiService triage, alerts #120-122,
  // 2026-10-27): the base collapses to URL.origin in config.ts and
  // the path segments are fixed string literals.
  // codeql[js/request-forgery]
  return fetch(`${API_V1_URL}${url}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });
}

/**
 * The apiFetch of the mobile port: JSON in/out, one refresh+retry on 401,
 * typed Error with the human-readable DRF message (detail >
 * non_field_errors > first field error — [Q13], ported verbatim).
 */
export async function apiFetch<T>(url: string, options: ApiFetchOptions = {}): Promise<T> {
  let response = await authenticatedFetch(url, options);
  if (response.status === 401 && !options.anonymous) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      response = await authenticatedFetch(url, options);
    } else {
      unauthorizedHandler?.();
    }
  }
  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as unknown;
    throw new Error(
      extractErrorMessage(errorData) || response.statusText || `HTTP ${response.status}`,
    );
  }
  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
}

/** Human-readable message from a DRF error body (ported verbatim). */
export function extractErrorMessage(errorData: unknown): string {
  if (typeof errorData !== "object" || errorData === null) return "";
  const data = errorData as Record<string, unknown>;
  if (typeof data.detail === "string") return data.detail;
  const nonField = data.non_field_errors;
  if (Array.isArray(nonField) && nonField.length > 0) return String(nonField[0]);
  for (const value of Object.values(data)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
      return value[0];
    }
  }
  return "";
}

/** Hard ceiling for the collect-all helpers (B4, ported). */
const COLLECT_ALL_MAX_PAGES = 50;

/** Follow page-number `next` links until exhausted or the 50-page cap. */
export async function collectAllPages<T>(
  fetchPage: (page: number) => Promise<PaginatedResponse<T>>,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= COLLECT_ALL_MAX_PAGES; page += 1) {
    const response = await fetchPage(page);
    out.push(...response.results);
    if (!response.next) break;
  }
  return out;
}

/** Follow cursor `next` links until exhausted or the 50-page cap. */
export async function collectAllCursorPages<T>(
  fetchPage: (cursor: string | null) => Promise<CursorPaginatedResponse<T>>,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < COLLECT_ALL_MAX_PAGES; i += 1) {
    const response = await fetchPage(cursor);
    out.push(...response.results);
    cursor = cursorParamFromUrl(response.next);
    if (!cursor) break;
  }
  return out;
}

// Test seam: reset module state between tests (jest modules are shared).
export function __resetForTests(): void {
  unauthorizedHandler = null;
  tokenStore = null;
  refreshInFlight = null;
}
