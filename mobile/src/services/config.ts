// Central API configuration — the RN counterpart of the web app's
// src/lib/api-config.ts. The base URL ships as an Expo extra so EAS build
// profiles can point release channels at the production API while local
// dev hits the dockerized stack (10.0.2.2 = host loopback from the
// Android emulator; the iOS simulator shares the host network).
import Constants from "expo-constants";

/**
 * Normalize the config-derived API base to a validated absolute http(s)
 * ORIGIN (mirrors the web app's api-config normalizeApiBase, commit
 * 35dd5181, including the URL.origin sanitize step CodeQL's
 * js/request-forgery model recognizes).
 *
 * The Expo extra / EXPO_PUBLIC_API_BASE is deploy-time configuration, not
 * user input, but it IS env-derived, which every fetch() call site in
 * ApiClient/AuthService inherits. Parsing through the URL constructor
 * validates the scheme and collapses the value to its origin; a malformed,
 * non-http(s) or path-bearing value falls back to the documented emulator
 * default instead of reaching any call site.
 */
function normalizeApiOrigin(raw: string | undefined): string {
  const fallback = "http://10.0.2.2:8010";
  const candidate = raw ?? fallback;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`unsupported API base protocol: ${parsed.protocol}`);
    }
    return parsed.origin;
  } catch (err) {
    console.warn(
      `[config] invalid API base ${JSON.stringify(candidate)}; falling back to ${fallback}`,
      err,
    );
    return fallback;
  }
}

/** Validated origin of the backend server (scheme://host[:port], no path). */
export const API_BASE_URL: string = normalizeApiOrigin(
  Constants.expoConfig?.extra?.apiBase ?? process.env.EXPO_PUBLIC_API_BASE,
);

/** Full base for all /api/v1 endpoints. */
export const API_V1_URL: string = `${API_BASE_URL}/api/v1`;
