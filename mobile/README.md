# WebCoder mobile (Expo / React Native / TypeScript)

One codebase → Google Play + the App Store, plus installable PWA parity on
the web. The app talks to the SAME Django API the web app uses; the service
layer is a typed port of `src/services/ApiService.ts` (identical paths,
envelopes, and snake_case payloads).

## Layout

| Path | What |
|---|---|
| `app/` | expo-router screens (auth, problems, editor+submit, submissions, leaderboard, forum, notifications, contests, settings) |
| `src/services/` | ApiClient (Bearer auth + single-flight refresh) + domain services |
| `src/state/` | AuthStore (bootstrap/login/logout), SettingsStore (locale + `t()`), SecureStore-backed TokenStore |
| `src/i18n/` | 28-locale registry + the SAME message catalogs as the web app (copied by `scripts/copy-locales.mjs`, parity-tested) |
| `src/utils/` | statement resolution (user locale → EN fallback), per-language effective limits, partial-code locked-region model, verdict/format |
| `src/theme/` | the web design tokens (palette/rating bands) ported |
| `maestro/` | E2E flows (see `maestro/README.md`) |
| `docs/` | store listing package, iOS owner runbook, Android release/signing |
| `fastlane/`, `eas.json` | store upload lanes + EAS build profiles (both platforms) |

## Commands

```bash
npm install
npm run copy-locales   # re-sync catalogs after any web src/locales change
npm test               # jest (jest-expo)
npm run test:coverage  # coverage — 100% LINES threshold on services/state/utils/i18n
npm run typecheck      # tsc --noEmit
npm run android        # dev against http://10.0.2.2:8010 (host loopback from the emulator)
```

## Auth model (mobile lane of the SP1 cookie flow)

`backend/users/authentication.py` accepts `Authorization: Bearer <access>`
(plain simplejwt, CSRF-exempt) beside the browser cookie lane. Login returns
the access token in the body; the ROTATING `wc_refresh` cookie is captured
from Set-Cookie; both persist in expo-secure-store (Android Keystore / iOS
Keychain). On 401 the client refreshes with the body refresh once
(single-flight), re-captures the rotated refresh cookie, and retries.
Verified against the live API on 2026-11-02 (see ApiClient.ts header).

## Release

- Android: `docs/ANDROID-RELEASE.md` (keystore lives OUTSIDE the repo).
- iOS: `docs/IOS-RUNBOOK.md` (EAS cloud build or any Mac; owner supplies
  the Apple Developer Program enrollment only).
