// Central API configuration — the RN counterpart of the web app's
// src/lib/api-config.ts. The base URL ships as an Expo extra so EAS build
// profiles can point release channels at the production API while local
// dev hits the dockerized stack (10.0.2.2 = host loopback from the
// Android emulator; the iOS simulator shares the host network).
import Constants from "expo-constants";

/**
 * Normalize the config-derived API base to a validated absolute http(s)
 * URL (mirrors the web app's api-config normalizeApiBase, commit 35dd5181).
 *
 * The Expo extra / EXPO_PUBLIC_API_BASE is deploy-time configuration, not
 * user input, but it IS env-derived, which every fetch() call site in
 * ApiClient/AuthService inherits. Parsing it through the URL constructor
 * validates the scheme and re-serializes the value; a malformed or
 * non-http(s) value falls back to the documented emulator default instead
 * of reaching any call site.
 */
function normalizeApiBase(raw: string | undefined): string {
  const fallback = "http://10.0.2.2:8010/api/v1";
  const candidate = raw ?? fallback;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`unsupported API base protocol: ${parsed.protocol}`);
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch (err) {
    console.warn(
      `[config] invalid API base ${JSON.stringify(candidate)}; falling back to ${fallback}`,
      err,
    );
    return fallback;
  }
}

/** Base URL of the backend API v1 (validated, no trailing slash). */
export const API_V1_URL: string = normalizeApiBase(
  Constants.expoConfig?.extra?.apiBase ?? process.env.EXPO_PUBLIC_API_BASE,
);
