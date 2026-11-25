// Central API configuration — the RN counterpart of the web app's
// src/lib/api-config.ts. The base URL ships as an Expo extra so EAS build
// profiles can point release channels at the production API while local
// dev hits the dockerized stack (10.0.2.2 = host loopback from the
// Android emulator; the iOS simulator shares the host network).
import Constants from 'expo-constants';

export const API_V1_URL: string = (() => {
  const raw =
    (Constants.expoConfig?.extra?.apiBase as string | undefined) ??
    process.env.EXPO_PUBLIC_API_BASE ??
    'http://10.0.2.2:8010/api/v1';
  // The base comes from build configuration; re-derive it from parsed URL
  // components so only an http(s) origin + path can ever reach fetch()
  // (protocol allowlist, credentials stripped, no search/hash carried).
  const parsed = new URL(raw);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`API base must be http(s), got: ${parsed.protocol}`);
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
})();
