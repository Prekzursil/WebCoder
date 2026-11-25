# Android e2e lane (adb + uiautomator)

The runnable replacement for the written-but-uninstallable Maestro flows
(see `../maestro/`): `run-android.mjs` drives the SAME two scenarios —
**login-and-browse** and **submit-solution**, plus a third on-device
**scratch-stage** smoke — through `adb` and
`uiautomator dump`, with no extra toolchain to install (the Android
platform tools are all it needs; Maestro could not be installed on this
machine — see the mobile-wave report).

## Prerequisites

1. A booted emulator/device with a **debug build** of the app installed:

   ```bash
   cd mobile
   npx expo prebuild -p android
   cd android && ./gradlew assembleDebug && cd ..
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

2. The live API reachable from the device. For the stock emulator that is
   the host-loopback alias `http://10.0.2.2:8010` (the dockerized
   backend); override with `ANDROID_E2E_API` if yours differs.

3. The seeded users (docker stack fixtures): `bob` / `BobPass-2026!x`.

## Run

```bash
node mobile/e2e/run-android.mjs            # all flows
node mobile/e2e/run-android.mjs login      # login-and-browse only
node mobile/e2e/run-android.mjs submit     # submit-solution only
node mobile/e2e/run-android.mjs scratch    # scratch-stage smoke only
```

Useful env vars:

| Var | Meaning | Default |
|---|---|---|
| `ANDROID_SERIAL` | target a specific device | first device |
| `ANDROID_E2E_API` | API base reachable from the device | `http://10.0.2.2:8010` |
| `ANDROID_E2E_TIMEOUT_MS` | per-assertion timeout | `45000` |

Exit code 0 = all flows passed. On failure the runner saves the UI
hierarchy XML and a screencap PNG to the OS temp dir and exits 1.

## What the flows assert

- **login**: app launches → Login → bob/BobPass-2026!x → the drawer shows
  `bob` → Problems renders catalog cards (`#id …`) → Settings shows the
  Language row.
- **submit**: login → Problems → first problem → Submit → Python 3 →
  type `print(42)` → Submit → the submission page renders (`#id`), which
  polls the judge until a verdict settles.

- **scratch**: fresh login (a persisted session can carry an expired
  token — the flow logs out first) → Problems → search `JFW-D` → open
  problem 1512 → Submit Solution → the WebView stage boots (the
  `Loading…` bridge hint clears and the Run/Stop row stays up — an init
  error replaces it with an error box, so a second sample guards the
  race) → Submit → the sb3 project is transpiled and judged, and the
  submission page renders (`#id`).

Device quirks the lane encodes (each verified on the API-35 emulator):
drawer rows need a +240px x-offset tap; the login page has several
`Login` nodes (the submit button is the one with `content-desc`); a
focused EditText's soft keyboard swallows the NEXT button tap — the lane
sends KEYCODE_ESCAPE before tapping; an IME ENTER after a spaced search
query can commit a partial composition (re-query "sa"), so the scratch
flow searches the space-free `JFW-D` and waits out the 300ms debounce;
the scratch detail page's notice text contains the word "submit", so the
entry locator is anchored to `^Submit Solution`. Blockly problems
render in a WebView whose internals uiautomator cannot see — that lane
is covered by the jest bridge tests plus the web e2e blocks-real spec.

## CI

`.github/workflows/e2e-mobile.yml` (workflow_dispatch) boots a headless
emulator on ubuntu, builds+installs the debug app, starts the local
backend stack, and runs both flows. The lane itself is deterministic and
device-agnostic — the workflow is dispatch-triggered (not per-PR) because
it needs the full live stack.
