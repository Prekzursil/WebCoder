// Post-prebuild step (run AFTER `npx expo prebuild -p android`):
//  1. wires the OUT-OF-REPO upload keystore into android/app/build.gradle
//     (expo prebuild regenerates that file, so this is idempotent);
//  2. patches android:usesCleartextTraffic into AndroidManifest.xml —
//     Android 9+ blocks cleartext and local dev/preview builds talk to the
//     dockerized backend at http://10.0.2.2 (production API is HTTPS).
// The keystore itself is NEVER committed — see docs/ANDROID-RELEASE.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gradleFile = path.join(here, '..', 'android', 'app', 'build.gradle');
const manifestFile = path.join(here, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

/**
 * Read a file, transform its text, and write it back through the SAME
 * open descriptor (r+): no window exists between the read that decides
 * the patch and the write that applies it (CodeQL js/race-in-write).
 * Returns the final text, or null when the file does not exist.
 */
function readPatchWrite(filePath, transform) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r+');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  try {
    const size = fs.fstatSync(fd).size;
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, 0);
    const original = buf.toString('utf8');
    const patched = transform(original);
    if (patched !== original) {
      fs.ftruncateSync(fd, 0);
      fs.writeSync(fd, patched, 0, 'utf8');
    }
    return patched;
  } finally {
    fs.closeSync(fd);
  }
}

// ---- 1. Gradle signing ----------------------------------------------------
const SIGNING_CONFIG_SNIPPET = `        // Upload-key signing: the keystore lives OUTSIDE the repo (never
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
        }`;

const gradleResult = readPatchWrite(gradleFile, (text) => {
  if (text.includes('WEBCODER_UPLOAD_STORE')) return text; // already wired
  const anchor = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;
  const replacement = anchor.replace(/\n    \}$/, `\n${SIGNING_CONFIG_SNIPPET}\n    }`);
  const releaseAnchor = '            signingConfig signingConfigs.debug';
  const releaseReplacement =
    "            signingConfig System.getenv('WEBCODER_UPLOAD_STORE') ? signingConfigs.upload : signingConfigs.debug";
  if (!text.includes(anchor) || !text.includes(releaseAnchor)) {
    throw new Error('gradle anchors not found — expo prebuild output changed; update this script.');
  }
  return text.replace(anchor, replacement).replace(releaseAnchor, releaseReplacement);
});

if (gradleResult === null) {
  console.error('android/app/build.gradle not found — run `npx expo prebuild -p android` first.');
  process.exit(1);
}
console.log(
  gradleResult.includes('WEBCODER_UPLOAD_STORE') && gradleResult.includes('signingConfigs.upload')
    ? 'upload signing wired into android/app/build.gradle'
    : 'ERROR: signing patch did not apply',
);

// ---- 2. Manifest cleartext (local-stack builds) ---------------------------
const manifestResult = readPatchWrite(manifestFile, (text) =>
  text.includes('usesCleartextTraffic')
    ? text // already patched
    : text.replace('<application ', '<application android:usesCleartextTraffic="true" '),
);
if (manifestResult === null) {
  console.warn(
    'AndroidManifest.xml not found (prebuild has not run yet?) — cleartext patch skipped.',
  );
} else {
  console.log(
    manifestResult.includes('usesCleartextTraffic')
      ? 'usesCleartextTraffic present in AndroidManifest.xml'
      : 'ERROR: cleartext patch did not apply',
  );
}
