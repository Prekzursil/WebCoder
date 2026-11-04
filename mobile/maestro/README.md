# Maestro E2E flows

Install Maestro (<https://maestro.mobile.dev>): `curl -Ls "https://get.maestro.mobile.dev" | bash`
(on Windows: `winget install Maestro` or the CI container `mobiledev/maestro`).

Run against a debug build on a booted emulator with the local backend:

```bash
cd mobile
npx expo prebuild -p android
cd android && ./gradlew assembleDebug && cd ..
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
EXPO_PUBLIC_API_BASE=http://10.0.2.2:8010/api/v1 npx expo run:android   # or relaunch the installed app
maestro test maestro/*.yaml
```

`login-and-browse.yaml` — auth + catalog + settings (safe on any dataset).
`submit-solution.yaml` — problem → editor → language picker → submit →
verdict-polling page (needs a seeded APPROVED problem; the docker stack
ships one via the seed fixtures).
