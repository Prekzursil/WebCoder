# WebCoder mobile (Expo / React Native / TypeScript)

One codebase → Google Play + the App Store, plus installable PWA parity on
the web. The app talks to the SAME Django API the web app uses; the service
layer is a typed port of `src/services/ApiService.ts` (identical paths,
envelopes, and snake_case payloads).

## Layout

| Path | What |
|---|---|
| `app/` | expo-router screens (auth, problems, editor+submit incl. the block lane, submissions, leaderboard, forum, notifications, contests, classroom, translate, settings) |
| `src/services/` | ApiClient (Bearer auth + single-flight refresh) + domain services |
| `src/state/` | AuthStore (bootstrap/login/logout), SettingsStore (locale + `t()`), SecureStore-backed TokenStore |
| `src/i18n/` | 30-locale registry + the SAME message catalogs as the web app (copied by `scripts/copy-locales.mjs`, parity-tested) |
| `src/utils/` | statement resolution (user locale → EN fallback), per-language effective limits, partial-code locked-region model, block editor HTML/bridge builder + complexity hints, verdict/format |
| `src/ui/BlocklyEditor.tsx` | the block editor: official Blockly UMD bundles (assets/blockly/, copied by `scripts/copy-blockly.mjs`) running in a react-native-webview; generated source submits with `language` = generator |
| `src/ui/ScratchEditor.tsx` | the Scratch stage: scratch-vm/blocks/render via the esbuild bundle (assets/scratch/, built by `scripts/build-scratch.mjs`) in a react-native-webview; the sb3 project JSON submits under `language: 'scratch'` |
| `src/theme/` | the web design tokens (palette/rating bands) ported |
| `maestro/` | E2E flows (see `maestro/README.md`) |
| `docs/` | store listing package, iOS owner runbook, Android release/signing |
| `fastlane/`, `eas.json` | store upload lanes + EAS build profiles (both platforms) |

## Commands

```bash
npm install
npm run copy-locales   # re-sync catalogs after any web src/locales change
npm run copy-blockly   # re-sync the Blockly UMD bundles after a blockly bump
npm run build-scratch  # rebuild the Scratch editor bundle after a scratch-* bump
npm test               # jest (jest-expo)
npm run test:coverage  # coverage — 100% LINES threshold on services/state/utils/i18n
npm run typecheck      # tsc --noEmit
npm run lint           # eslint (eslint-config-expo) — zero problems
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

## The block lane (judge-fairness wave D on mobile)

`engine: blockly` problems open the WebView block editor — the SAME
default toolbox/starter and `wc_input_*` site blocks as the web
`BlockEditor.tsx`, generating judge-compatible Python/JS (submitted with
`language` = the generator; complexity hints flag nested/endless loops).
`engine: scratch` problems open the WebView Scratch stage: the SAME
scratch-vm + scratch-blocks + scratch-render stack the web editor mounts,
bundled to a single esbuild IIFE (`assets/scratch/editor.txt`, built by
`npm run build:scratch` from the root node_modules with the media set +
default assets inlined as data URIs). The sb3 project JSON flows back
over the bridge and submits under `language: 'scratch'` — the server
transpiles + judges it exactly like a web submission.
until a native stage ships (documented slice of the mobile wave).
