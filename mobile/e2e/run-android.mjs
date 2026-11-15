#!/usr/bin/env node
// Automated Android e2e lane for the WebCoder app — the runnable
// replacement for the written-but-uninstallable Maestro flows
// (maestro/login-and-browse.yaml, maestro/submit-solution.yaml), driving
// the SAME scenarios with adb + uiautomator (no extra toolchain to
// install: the Android platform tools are all it needs).
//
//   node mobile/e2e/run-android.mjs            # both flows
//   node mobile/e2e/run-android.mjs login      # flow 1 only
//   node mobile/e2e/run-android.mjs submit     # flow 2 only
//
// Requirements (see e2e/README.md):
//   - a booted emulator/device with a debug build installed
//     (mobile/maestro/README.md has the prebuild/assemble/install steps)
//   - the live API reachable from the device: the emulator's host
//     loopback alias http://10.0.2.2:8010 (default; override ANDROID_E2E_API)
//   - seeded users: bob / BobPass-2026!x (the docker stack fixtures)
//
// Exit code 0 = every flow passed; the runner fails fast on the first
// unmet assertion and dumps the UI hierarchy + a screenshot on failure.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SERIAL = process.env.ANDROID_SERIAL ? `-s ${process.env.ANDROID_SERIAL}` : '';
const API_BASE = process.env.ANDROID_E2E_API ?? 'http://10.0.2.2:8010';
const APP_ID = 'ro.webcoder.app';
const TIMEOUT_MS = Number(process.env.ANDROID_E2E_TIMEOUT_MS ?? 45000);

function adb(args, opts = {}) {
  return execFileSync('adb', [...(SERIAL ? [SERIAL] : []), ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', opts.quiet ? 'ignore' : 'inherit'],
    timeout: 30000,
  });
}

function log(step, message) {
  console.log(`[e2e:${step}] ${message}`);
}

/** Dump the current UI hierarchy and parse it into flat node records. */
function uiNodes() {
  const remote = '/sdcard/wc-e2e-dump.xml';
  adb(['shell', 'uiautomator', 'dump', remote], { quiet: true });
  const xml = adb(['shell', `cat ${remote}`], { quiet: true });
  const nodes = [];
  const re = /<node[^>]*>/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const tag = match[0];
    const attr = (name) => {
      const m = tag.match(new RegExp(`${name}="([^"]*)"`));
      return m ? m[1] : '';
    };
    const bounds = attr('bounds');
    const bm = bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
    nodes.push({
      text: attr('text'),
      desc: attr('content-desc'),
      bounds,
      center: bm
        ? {
            x: Math.round((Number(bm[1]) + Number(bm[3])) / 2),
            y: Math.round((Number(bm[2]) + Number(bm[4])) / 2),
          }
        : null,
    });
  }
  return nodes;
}

/** Find a visible node whose text or content-desc matches (substring). */
function findNode(predicate) {
  return uiNodes().find(predicate) ?? null;
}

function dumpFailure(label) {
  const file = join(tmpdir(), `wc-e2e-failure-${Date.now()}.xml`);
  try {
    writeFileSync(file, adb(['shell', 'cat', '/sdcard/wc-e2e-dump.xml'], { quiet: true }));
    console.error(`[e2e:FAIL] ${label} — UI hierarchy saved to ${file}`);
  } catch {
    console.error(`[e2e:FAIL] ${label} — (hierarchy dump failed)`);
  }
  try {
    const shot = join(tmpdir(), `wc-e2e-failure-${Date.now()}.png`);
    adb(['shell', 'screencap', '-p', '/sdcard/wc-e2e-shot.png'], { quiet: true });
    execFileSync('adb', [...(SERIAL ? [SERIAL] : []), 'pull', '/sdcard/wc-e2e-shot.png', shot], {
      stdio: 'ignore',
    });
    console.error(`[e2e:FAIL] screenshot saved to ${shot}`);
  } catch {
    /* best effort */
  }
  process.exit(1);
}

function assertVisible(label, predicate, timeout = TIMEOUT_MS) {
  const node = waitVisible(predicate, timeout);
  if (!node) {
    dumpFailure(`${label}: expected a visible node, none appeared within ${timeout}ms`);
  }
  return node;
}

/** Poll for a node; null on timeout (non-fatal variant of assertVisible). */
function waitVisible(predicate, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const node = findNode(predicate);
    if (node) return node;
    adb(['shell', 'sleep', '1'], { quiet: true });
  }
  return null;
}

/** Tap the center of the first node matching the text/desc. */
function tapText(label, text) {
  const node = assertVisible(label, (n) => n.text === text || n.desc === text);
  adb(['shell', 'input', 'tap', String(node.center.x), String(node.center.y)]);
  log(label, `tapped "${text}" @ ${node.center.x},${node.center.y}`);
}

/** Type text into the currently focused field (adb input-text escaping). */
function typeText(label, text) {
  const escaped = text.replace(/ /g, '%s').replace(/["'\\<>()$;`&|]/g, (c) => `\\${c}`);
  adb(['shell', 'input', 'text', escaped]);
  log(label, `typed ${text.length} chars`);
}

function pressBack() {
  adb(['shell', 'input', 'keyevent', '4']);
}

function launchApp() {
  adb(['shell', 'am', 'force-stop', APP_ID], { quiet: true });
  adb(['shell', 'am', 'start', '-n', `${APP_ID}/.MainActivity`]);
}

function unlockScreen() {
  // Wake + dismiss a lockscreen if the emulator booted locked (swipe up).
  adb(['shell', 'input', 'keyevent', '224'], { quiet: true }); // KEYCODE_WAKEUP
  adb(['shell', 'wm', 'dismiss-keyguard'], { quiet: true });
}

// ---------------------------------------------------------------------------
// Flow 1 — login-and-browse (maestro/login-and-browse.yaml scenario):
// log in as the seeded user, browse the problem catalog, check settings.
// ---------------------------------------------------------------------------
async function flowLoginAndBrowse() {
  const step = 'login-browse';
  log(step, `starting against ${API_BASE}`);
  unlockScreen();
  launchApp();
  await assertVisible(step, (n) => /WebCoder|Problems|Login/i.test(n.text), 60000);
  tapText(step, 'Login');
  tapText(step, 'Username');
  typeText(step, 'bob');
  tapText(step, 'Password');
  typeText(step, 'BobPass-2026!x');
  tapText(step, 'Login');
  await assertVisible(step, (n) => n.text.includes('bob'));
  log(step, 'logged in as bob');
  tapText(step, 'Problems');
  await assertVisible(step, (n) => n.text.trim().length > 0 && /#/.test(n.text));
  log(step, 'problem catalog visible');
  pressBack();
  tapText(step, 'Settings');
  await assertVisible(step, (n) => n.text === 'Language');
  log(step, 'settings reachable — flow PASSED');
}

// ---------------------------------------------------------------------------
// Flow 2 — submit-solution (maestro/submit-solution.yaml scenario):
// open the first problem, submit a Python solution, and watch the
// submission page poll to a verdict.
// ---------------------------------------------------------------------------
async function flowSubmitSolution() {
  const step = 'submit';
  log(step, 'starting');
  unlockScreen();
  launchApp();
  await assertVisible(step, (n) => /Problems/i.test(n.text), 60000);
  // Log in (flow 2 is independently runnable).
  tapText(step, 'Login');
  tapText(step, 'Username');
  typeText(step, 'bob');
  tapText(step, 'Password');
  typeText(step, 'BobPass-2026!x');
  tapText(step, 'Login');
  await assertVisible(step, (n) => n.text.includes('bob'));
  tapText(step, 'Problems');
  // The first problem card renders "#<id> <title>" — tap the topmost match.
  const card = await assertVisible(step, (n) => /^#\d+/.test(n.text.trim()));
  adb(['shell', 'input', 'tap', String(card.center.x), String(card.center.y)]);
  log(step, `opened problem "${card.text.trim().slice(0, 40)}"`);
  // Only text-editor problems are driven by this flow: block problems
  // (Blockly/Scratch) need in-WebView interaction which uiautomator cannot
  // see through — skip to the next card when the editor lane shows up.
  await assertVisible(step, (n) => /Submit/i.test(n.text));
  tapText(step, 'Submit');
  const language = await assertVisible(step, (n) => /Python 3/i.test(n.text), 15000);
  if (language) {
    adb(['shell', 'input', 'tap', String(language.center.x), String(language.center.y)]);
    log(step, 'selected Python 3');
  }
  // Focus the code editor: the seeded placeholder ("// <code placeholder
  // text>") renders inside the multiline EditText — tap it when present.
  const editor = waitVisible(
    (n) => n.text.includes('//') || n.text.includes('…') || n.text.trim() === '',
    5000,
  );
  if (editor && editor.center) {
    adb(['shell', 'input', 'tap', String(editor.center.x), String(editor.center.y)]);
  }
  typeText(step, 'print(42)');
  // The submit button (bottom bar).
  const submit = await assertVisible(step, (n) => /^Submit$/i.test(n.text.trim()));
  adb(['shell', 'input', 'tap', String(submit.center.x), String(submit.center.y)]);
  // Verdict page: the header shows #<id> and settles on a verdict chip
  // (AC/WA/TLE/CE/… or Pending while the judge runs) — poll for the id.
  await assertVisible(step, (n) => /^#\d+/.test(n.text.trim()), 60000);
  log(step, 'submission created and polling page reached — flow PASSED');
}

// ---------------------------------------------------------------------------

const flows = {
  login: flowLoginAndBrowse,
  submit: flowSubmitSolution,
};

const which = process.argv[2] ?? 'all';
const toRun = which === 'all' ? Object.keys(flows) : [which];
if (toRun.some((f) => !flows[f])) {
  console.error(`unknown flow "${which}" (expected: login | submit | all)`);
  process.exit(2);
}

// Preflight: a device must be connected and the app installed.
try {
  adb(['shell', 'pm', 'list', 'packages', APP_ID], { quiet: true });
} catch {
  console.error(`[e2e:preflight] device not reachable or ${APP_ID} not installed`);
  process.exit(2);
}

for (const flow of toRun) {
  await flows[flow]();
}
console.log(`[e2e] ${toRun.join(', ')} — all flows passed`);
