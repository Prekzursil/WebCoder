# iOS release — owner runbook (accounts & Mac are the only missing inputs)

This Windows box cannot run Xcode. Everything code-side is prepared in-repo;
the owner supplies an Apple Developer Program enrollment (USD 99/yr) and
either (a) any Mac for 30 minutes, or (b) no Mac at all by using EAS cloud
builds. `iosPrepared` in the wave result lists exactly what is ready.

## 1. One-time Apple setup (owner, ~30 min)

1. Enroll the Apple Developer Program at developer.apple.com (individual
   or organization; an org enrollment enables a real "WebCoder" team name).
2. In App Store Connect → My Apps → **+ New App**: name `WebCoder`,
   primary locale English (add Romanian localization later from the
   listing package), bundle ID `ro.webcoder.app` (register it in the
   Identifiers tab first), SKU `webcoder-ios`.
3. Fill the listing from `mobile/docs/STORE-LISTING.md` (App Store section)
   and point the Privacy Policy URL at `https://<web-domain>/privacy`.
4. Complete the age-rating questionnaire → expected result 4+.

## 2. Build path A — EAS cloud build (no Mac needed)

```bash
cd mobile
npm i -g eas-cli
eas login                    # the owner's Expo account
eas init                     # fills extra.eas.projectId in app.config.ts
eas credentials -p ios       # let EAS generate + store the distribution cert & profile
eas build -p ios --profile production
```

`eas.json` (committed) already defines the production profile with the
production API base. The build lands as an `.ipa` on EAS's dashboard;
`eas submit -p ios --profile production` (placeholders for appleId /
ascAppId / teamId are marked in `eas.json → submit.production.ios`)
pushes it to TestFlight.

## 3. Build path B — any Mac with Xcode 16+

```bash
cd mobile
npx expo prebuild -p ios      # generates ios/ (git-ignored)
open ios/WebCoder.xcworkspace # set the team in Signing & Capabilities
# or fully scripted:
cd fastlane && bundle install && bundle exec fastlane ios release
```

`fastlane/Fastfile` lane `ios release` builds the app-store archive and
uploads to TestFlight (`skip_waiting_for_build_processing: true`).

## 4. TestFlight → App Store review

1. Internal TestFlight group → add the owner's devices (first build takes
   ~15 min to process; Apple runs its own automated scan).
2. Beta review is automatic for internal testers; submit for App Review
   with: the EN/RO metadata, the 8-phone screenshot set (see the listing
   doc's screenshots plan — capture from the iOS simulator), the 4+
   rating, and answers matching the content-rating table.
3. Demo-account note for review: attach the bob demo credentials only if
   the production stack will keep a seeded demo user; otherwise record a
   60 s login video and attach it to the review notes.

## 5. Prepared in-repo (verified this wave)

- Full app source + tests (`mobile/`, jest suite green — see wave result)
- `eas.json` — development / preview / production profiles for BOTH
  platforms + a submit section with clearly-marked owner placeholders
- `fastlane/Fastfile` — android + ios lanes
- App icon 1024×1024, adaptive icon, splash (brand tokens)
- Bundle id `ro.webcoder.app`, display name, dark UI style, tablet support
- Store listing copy EN/RO incl. keywords and screenshots plan
- Privacy-policy page on the web app covering the mobile clients
