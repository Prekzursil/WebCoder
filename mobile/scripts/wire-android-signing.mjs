// Post-prebuild step: wires the OUT-OF-REPO upload keystore into
// android/app/build.gradle (expo prebuild --clean regenerates that file,
// so the patch lives here and is idempotent). The keystore itself is
// NEVER committed — see docs/ANDROID-RELEASE.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gradleFile = path.join(here, '..', 'android', 'app', 'build.gradle');
if (!fs.existsSync(gradleFile)) {
  console.error('android/app/build.gradle not found — run `npx expo prebuild -p android` first.');
  process.exit(1);
}
let s = fs.readFileSync(gradleFile, 'utf8');
if (s.includes('WEBCODER_UPLOAD_STORE')) {
  console.log('signing already wired — no-op');
  process.exit(0);
}
const anchor = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;
const replacement = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        // Upload-key signing: the keystore lives OUTSIDE the repo (never
        // committed — see mobile/docs/ANDROID-RELEASE.md). Set the
        // WEBCODER_UPLOAD_* env vars before assembleRelease/bundleRelease;
        // when absent, release falls back to the debug key so CI and
        // emulator smoke builds keep working.
        if (System.getenv('WEBCODER_UPLOAD_STORE')) {
            upload {
                storeFile file(System.getenv('WEBCODER_UPLOAD_STORE'))
                storePassword System.getenv('WEBCODER_UPLOAD_STORE_PASSWORD')
                keyAlias System.getenv('WEBCODER_UPLOAD_KEY_ALIAS')
                keyPassword System.getenv('WEBCODER_UPLOAD_KEY_PASSWORD')
            }
        }
    }`;
if (!s.includes(anchor)) {
  console.error('signingConfigs anchor not found — expo prebuild output changed; update this script.');
  process.exit(1);
}
s = s.replace(anchor, replacement);
const releaseAnchor = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;
const releaseReplacement = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig System.getenv('WEBCODER_UPLOAD_STORE') ? signingConfigs.upload : signingConfigs.debug`;
if (!s.includes(releaseAnchor)) {
  console.error('release signingConfig anchor not found — expo prebuild output changed; update this script.');
  process.exit(1);
}
s = s.replace(releaseAnchor, releaseReplacement);
fs.writeFileSync(gradleFile, s);
console.log('upload signing wired into android/app/build.gradle');
