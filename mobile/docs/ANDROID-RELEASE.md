# Android release build & signing — owner runbook

## What is already in this repo (no secrets)

- `mobile/app.config.ts` — `ro.webcoder.app`, versionCode source
- `mobile/eas.json` — production profile builds an `.aab` with the
  production `EXPO_PUBLIC_API_BASE`
- `mobile/fastlane/Fastfile` — `android release` lane uploads the AAB to
  the Play internal track via a service-account JSON

## Upload keystore — generated OUTSIDE the repo (rule: never commit keys)

This machine (the wave's build box) generated a dedicated upload keystore at
`C:\Users\Prekzursil\.webcoder-keys\webcoder-upload.jks` (path outside the
repo; it is NOT referenced by any committed file). Regenerate/rotate with:

```powershell
mkdir $HOME\.webcoder-keys
keytool -genkeypair -v `
  -keystore $HOME\.webcoder-keys\webcoder-upload.jks `
  -alias webcoder-upload -keyalg RSA -keysize 4096 -validity 10000 `
  -storepass <STRONG-PASS> -keypass <STRONG-PASS> `
  -dname "CN=WebCoder, OU=Mobile, O=WebCoder, L=Bucharest, C=RO"
```

Record the SHA-1/SHA-256 (`keytool -list -v -keystore …`) — Play App
Signing enrolls the key on first upload.

### Windows deep-worktree note (this wave's build box)

The mandated disposable-worktree location is ~200 chars deep; ninja hard-caps
Windows paths at 260 and the five CMake-heavy native modules overflow.
Two supported escapes:

1. Build from a SHORT checkout (recommended, what this wave used):
   git worktree add D:\wcm2 -b mobile-app-build mobile-app, then
   cd mobile && npm ci && node scripts/copy-locales.mjs &&
   npx expo prebuild -p android --no-install &&
   node scripts/wire-android-signing.mjs && cd android && ./gradlew assembleRelease
2. Or set WEBCODER_RELOCATE_NATIVE=1 and run
   scripts/relocate-native-modules.cmd once (physically moves the five
   packages to C:/rnreal/node_modules with junctions back), then build
   from the deep tree — android/settings.gradle's opt-in table repoints
   the gradle projectDirs at the short paths.

### Local release build with the keystore (what the CI/owner runs)

```bash
cd mobile
npx expo prebuild -p android
cd android
# assemble the signed release (gradle reads the env vars below)
$env:WEBCODER_UPLOAD_STORE=$HOME\.webcoder-keys\webcoder-upload.jks
$env:WEBCODER_UPLOAD_KEY_ALIAS=webcoder-upload
$env:WEBCODER_UPLOAD_STORE_PASSWORD=…
$env:WEBCODER_UPLOAD_KEY_PASSWORD=…
./gradlew assembleRelease    # APK for direct install/emulator smoke tests
./gradlew bundleRelease      # AAB for the Play upload
```

Or fully cloud-side: `eas build -p android --profile production`
(EAS holds the keystore as a secure credential; upload it via
`eas credentials -p android`).

### Google Play upload

```bash
export PLAY_SERVICE_ACCOUNT_JSON=/path/to/play-service-account.json
cd mobile/fastlane && bundle exec fastlane android release
```

The service account (Play Console → Users & permissions → API access)
needs the Play App Release permission. First upload must be via the
console to create the app + enroll Play App Signing.
