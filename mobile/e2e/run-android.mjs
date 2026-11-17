#!/usr/bin/env node
// Automated Android e2e lane for the WebCoder app — the runnable
// replacement for the written-but-uninstallable Maestro flows
// (maestro/login-and-browse.yaml, maestro/submit-solution.yaml), driving
// the SAME scenarios with adb + uiautomator (no extra toolchain to
// install: the Android platform tools are all it needs).
//
//   node mobile/e2e/run-android.mjs            # all flows
//   node mobile/e2e/run-android.mjs login      # flow 1 only
//   node mobile/e2e/run-android.mjs submit     # flow 2 only
//   node mobile/e2e/run-android.mjs scratch   # flow 3 only
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
import { mkdtempSync, writeFileSync } from 'node:fs';
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

/** Dump the current UI hierarchy and parse it into a NODE TREE: RN rows
 * are clickable containers while the label is a bare TextView, so tapping
 * the label itself does nothing — taps go to the nearest CLICKABLE
 * ancestor (or the node itself when it is clickable). */
function uiTree() {
  const remote = '/sdcard/wc-e2e-dump.xml';
  adb(['shell', 'uiautomator', 'dump', remote], { quiet: true });
  const xml = adb(['shell', `cat ${remote}`], { quiet: true });
  const attrOf = (tag, name) => {
    const m = tag.match(new RegExp(`${name}="([^"]*)"`));
    return m ? m[1] : '';
  };
  const parse = (tag) => {
    const bounds = attrOf(tag, 'bounds');
    const bm = bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
    return {
      text: attrOf(tag, 'text'),
      desc: attrOf(tag, 'content-desc'),
      cls: attrOf(tag, 'class'),
      clickable: attrOf(tag, 'clickable') === 'true',
      center: bm
        ? {
            x: Math.round((Number(bm[1]) + Number(bm[3])) / 2),
            y: Math.round((Number(bm[2]) + Number(bm[4])) / 2),
          }
        : null,
      children: [],
    };
  };
  const root = { children: [] };
  const stack = [root];
  const re = /<\/?node[^>]*?>/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const tag = match[0];
    if (tag.startsWith('</')) {
      stack.pop();
      continue;
    }
    if (tag.endsWith('/>')) {
      stack[stack.length - 1].children.push(parse(tag));
      continue;
    }
    const node = parse(tag);
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root;
}

/** Flatten the tree, keeping the nearest clickable ancestor on each node. */
function uiNodes() {
  const flat = [];
  const walk = (node, clickAncestor) => {
    const eff = node.clickable ? node : clickAncestor;
    if (node.text || node.desc || node.cls.includes('EditText')) {
      flat.push({ ...node, tapTarget: eff });
    }
    for (const child of node.children) walk(child, eff);
  };
  for (const child of uiTree().children) walk(child, null);
  return flat;
}

/** Find a visible node whose text or content-desc matches (substring). */
function findNode(predicate) {
  return uiNodes().find(predicate) ?? null;
}

// Failure artifacts land in a private per-run temp dir (mkdtempSync, 0700)
// instead of predictable filenames directly in the OS temp dir.
const failureDir = mkdtempSync(join(tmpdir(), 'wc-e2e-'));

function dumpFailure(label) {
  const file = join(failureDir, `failure-${Date.now()}.xml`);
  try {
    writeFileSync(file, adb(['shell', 'cat', '/sdcard/wc-e2e-dump.xml'], { quiet: true }));
    console.error(`[e2e:FAIL] ${label} — UI hierarchy saved to ${file}`);
  } catch {
    console.error(`[e2e:FAIL] ${label} — (hierarchy dump failed)`);
  }
  try {
    const shot = join(failureDir, `failure-${Date.now()}.png`);
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

/** Tap the first node matching the text/desc. `offsetX` shifts the tap
 * into the row: expo-router drawer rows expose only a narrow clickable
 * strip around the label while the visual row is full-width — tapping
 * the label center can land on a non-pressable sibling (verified on the
 * API-35 emulator: label center does nothing, +~220px navigates). */
function tapText(label, text, offsetX = 0) {
  const node = assertVisible(label, (n) => n.text === text || n.desc === text);
  const target = node.tapTarget ?? node;
  const x = target.center.x + offsetX;
  adb(['shell', 'input', 'tap', String(x), String(target.center.y)]);
  log(label, `tapped "${text}" @ ${x},${target.center.y}`);
}

/** Tap the first node whose content-desc matches exactly — the login
 * page has several text='Login' nodes (header, fields, button); only the
 * submit button carries content-desc='Login'. */
function tapDesc(label, text) {
  const node = assertVisible(label, (n) => n.desc === text);
  const target = node.tapTarget ?? node;
  adb(['shell', 'input', 'tap', String(target.center.x), String(target.center.y)]);
  log(label, `tapped desc "${text}" @ ${target.center.x},${target.center.y}`);
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

/** Swipe up (scroll down) to reveal content below the fold, re-checking
 * the hierarchy after each swipe — the problem detail page is taller than
 * the screen, so its Submit button only enters the dump after scrolling. */
function scrollUntilVisible(predicate, maxSwipes = 8) {
  for (let i = 0; i < maxSwipes; i++) {
    const found = findNode(predicate);
    if (found) return found;
    adb(['shell', 'input', 'swipe', '540', '1700', '540', '600', '400'], { quiet: true });
    adb(['shell', 'sleep', '1'], { quiet: true });
  }
  return findNode(predicate);
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

/** The login form fill: type credentials, dismiss the keyboard (a focused
 * EditText's soft keyboard swallows the submit-button tap — verified on
 * the emulator), then tap the desc='Login' submit (the page has several
 * text='Login' nodes). */
function doLogin(step) {
  tapText(step, 'Login', 240);
  tapText(step, 'Username');
  typeText(step, 'bob');
  tapText(step, 'Password');
  typeText(step, 'BobPass-2026!x');
  adb(['shell', 'input', 'keyevent', '111'], { quiet: true }); // KEYCODE_ESCAPE
  adb(['shell', 'sleep', '1'], { quiet: true });
  tapDesc(step, 'Login');
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
  // The session persists in the keystore: when the drawer already shows
  // the account row the login form is skipped (logged-in reruns).
  const loggedIn = waitVisible((n) => n.text.includes('Username: bob'), 5000);
  if (!loggedIn) {
    doLogin(step);
    await assertVisible(step, (n) => n.text.includes('bob'));
    log(step, 'logged in as bob');
  } else {
    log(step, 'session persisted — already logged in as bob');
  }
  tapText(step, 'Problems', 240);
  await assertVisible(step, (n) => /^\d+\.\s|^#\d+/.test(n.text.trim()));
  log(step, 'problem catalog visible');
  pressBack();
  // The settings hub entry is labeled with the language picker's name
  // ("Language" in EN) — its page carries the Logout button.
  tapText(step, 'Language', 240);
  await assertVisible(step, (n) => n.text === 'Settings' || n.text === 'Română');
  log(step, 'settings (language) page reachable — flow PASSED');
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
  // Log in when the session has not persisted (flow 2 is independently
  // runnable); a persisted session skips straight to the catalog.
  const loggedIn = waitVisible((n) => n.text.includes('Username: bob'), 5000);
  if (!loggedIn) {
    doLogin(step);
    await assertVisible(step, (n) => n.text.includes('bob'));
  }
  tapText(step, 'Problems', 240);
  // The first problem card renders "#<id> <title>" — tap the topmost match.
  const card = await assertVisible(step, (n) => /^\d+\.\s|^#\d+/.test(n.text.trim()));
  adb(['shell', 'input', 'tap', String(card.center.x), String(card.center.y)]);
  log(step, `opened problem "${card.text.trim().slice(0, 40)}"`);
  // The detail page renders the statement + per-language limits ABOVE the
  // submit entry, so the Submit button sits below the fold — scroll to it.
  await assertVisible(step, (n) => /PROBLEM STATEMENT|TIME LIMIT/i.test(n.text));
  const submitEntry = scrollUntilVisible((n) => /Submit/i.test(n.text));
  if (!submitEntry) {
    dumpFailure('submit: submit entry never appeared on the problem detail page');
  }
  adb([
    'shell',
    'input',
    'tap',
    String((submitEntry.tapTarget ?? submitEntry).center.x),
    String((submitEntry.tapTarget ?? submitEntry).center.y),
  ]);
  log(step, 'tapped the submit entry (after scrolling)');
  // The submit page pre-selects the preferred language (python3 for text
  // problems); tapping the "Python 3" pill is a harmless re-select.
  const language = waitVisible((n) => /Python 3/i.test(n.text), 15000);
  if (language && language.center) {
    adb(['shell', 'input', 'tap', String(language.center.x), String(language.center.y)]);
    log(step, 'selected Python 3');
  }
  // Focus the code editor (the seeded "// Paste your code here..."
  // placeholder renders inside the multiline EditText), then CLEAR it:
  // appending to the placeholder would submit a Python syntax error —
  // the cursor lands at the tapped end, so DELs wipe the placeholder.
  const editor = waitVisible(
    (n) => n.cls.includes('EditText') && (n.text.includes('//') || n.text.trim() === ''),
    8000,
  );
  if (!editor || !editor.center) {
    dumpFailure('submit: code editor (EditText) never appeared');
  }
  adb(['shell', 'input', 'tap', String(editor.center.x), String(editor.center.y)]);
  // Tapping mid-field leaves the cursor mid-text: jump to the END first,
  // then DEL backwards so the whole placeholder is wiped before typing.
  adb(['shell', 'input', 'keyevent', '123'], { quiet: true }); // KEYCODE_MOVE_END
  for (let i = 0; i < 40; i++) {
    adb(['shell', 'input', 'keyevent', '67'], { quiet: true }); // KEYCODE_DEL
  }
  typeText(step, 'print(42)');
  // Dismiss the soft keyboard: while the editor holds focus the keyboard
  // swallows taps on the bottom-bar button (verified on the emulator —
  // the same tap lands the instant the keyboard is gone).
  adb(['shell', 'input', 'keyevent', '111'], { quiet: true }); // KEYCODE_ESCAPE
  adb(['shell', 'sleep', '1'], { quiet: true });
  // The submit button (bottom bar): the page HEADER is also titled
  // "Submit" and comes first in the dump — only accept a node that is
  // itself clickable or has a clickable ancestor (the real button).
  const submit = await assertVisible(
    step,
    (n) =>
      (/^Submit$/i.test(n.text.trim()) || /^Submit$/i.test(n.desc.trim())) &&
      (n.clickable || n.tapTarget?.clickable),
  );
  const submitTarget = submit.tapTarget ?? submit;
  adb(['shell', 'input', 'tap', String(submitTarget.center.x), String(submitTarget.center.y)]);
  // Verdict page: the header shows #<id> and settles on a verdict chip
  // (AC/WA/TLE/CE/… or Pending while the judge runs) — poll for the id.
  await assertVisible(step, (n) => /^#\d+/.test(n.text.trim()), 60000);
  log(step, 'submission created and polling page reached — flow PASSED');
}

// ---------------------------------------------------------------------------
// Flow 3 — scratch stage smoke: open a scratch problem through the
// catalog, verify the WebView Scratch stage boots on-device (the
// "Loading…" hint clears when scratch-vm reports ready over the bridge)
// and drive a submission through the sb3→Python transpiler to a verdict.
// ---------------------------------------------------------------------------
/** Fresh-login guard: a persisted session can carry an EXPIRED access
 * token — the catalog then silently degrades to anonymous (the list
 * endpoint allows it) and the first authenticated call 401s (verified on
 * the emulator: search returned 401, the app fell back to an anonymous
 * unfiltered reload). Flows that SUBMIT need a live session: log out
 * first when a session exists, then always do a full login. */
async function ensureFreshLogin(step) {
  const loggedIn = waitVisible((n) => n.text.includes('Username: bob'), 5000);
  if (loggedIn) {
    // The settings hub entry is labeled "Language"; its page lists every
    // locale first, so the Logout button sits BELOW the fold — scroll.
    tapText(step, 'Language', 240);
    await assertVisible(step, (n) => n.text === 'Settings');
    const logout = scrollUntilVisible((n) => n.text.trim() === 'Logout');
    if (!logout) {
      dumpFailure(`${step}: Logout button not found on the settings page`);
    }
    const target = logout.tapTarget ?? logout;
    adb(['shell', 'input', 'tap', String(target.center.x), String(target.center.y)]);
    pressBack();
    await assertVisible(step, (n) => /Login/i.test(n.text), 30000);
    log(step, 'logged out the stale session');
  }
  doLogin(step);
  await assertVisible(step, (n) => n.text.includes('bob'));
  log(step, 'logged in as bob (fresh session)');
}

async function flowScratchStage() {
  const step = 'scratch';
  log(step, 'starting');
  unlockScreen();
  launchApp();
  await assertVisible(step, (n) => /Problems/i.test(n.text), 60000);
  await ensureFreshLogin(step);
  tapText(step, 'Problems', 240);
  // Narrow the catalog to the seeded scratch problems and open one. The
  // query is deliberately SPACE-FREE ("JFW-D" prefixes every seeded
  // scratch proof): an IME ENTER after a spaced query can commit a
  // partial composition and re-query with a truncated term (observed:
  // "say hi" re-queried as "sa"), so the lane types and waits out the
  // 300ms debounce instead of pressing enter.
  const search = assertVisible(step, (n) => n.cls.includes('EditText'));
  adb(['shell', 'input', 'tap', String(search.center.x), String(search.center.y)]);
  typeText(step, 'JFW-D');
  // Dismiss the keyboard: with the search field focused it swallows the
  // NEXT tap too (the Submit Solution button on the detail page).
  adb(['shell', 'input', 'keyevent', '111'], { quiet: true }); // KEYCODE_ESCAPE
  adb(['shell', 'sleep', '3'], { quiet: true }); // debounce (300ms) + fetch + render
  await assertVisible(step, (n) => /1512\.\s|1519\.\s|1498\.\s|1505\.\s/.test(n.text));
  const card = findNode((n) => /1512\.\s|1519\.\s/.test(n.text));
  adb(['shell', 'input', 'tap', String(card.center.x), String(card.center.y)]);
  log(step, `opened scratch problem "${card.text.trim().slice(0, 40)}"`);
  await assertVisible(step, (n) => /PROBLEM STATEMENT|TIME LIMIT/i.test(n.text));
  // ANCHORED match: the scratch detail page's NOTICE text ("...stage and
  // submit. The mobile app...") contains the word "submit" and an
  // unanchored /Submit/i grabs that PARAGRAPH first — tapping it does
  // nothing. The real entry is the "Submit Solution" button.
  const submitEntry = scrollUntilVisible((n) => /^Submit Solution/i.test(n.text.trim()));
  if (!submitEntry) {
    dumpFailure('scratch: submit entry never appeared on the detail page');
  }
  const entryTarget = submitEntry.tapTarget ?? submitEntry;
  adb(['shell', 'input', 'tap', String(entryTarget.center.x), String(entryTarget.center.y)]);
  // The submit page header is titled "Submit" (the DETAIL page header says
  // "Problem" and it also carries a "Solve with Scratch" NOTICE card, so
  // that caption alone cannot prove the navigation happened). The scratch
  // submit page BLOCKS the UI for tens of seconds while the WebView parses
  // the 10.6 MB inlined bundle — uiautomator may serve stale hierarchies
  // meanwhile, so allow a long window.
  await assertVisible(step, (n) => n.text.trim() === 'Submit', 90000);
  // The WebView boots the committed scratch bundle (scratch-vm + render):
  // the "Loading…" hint clears exactly when the bridge reports ready.
  const booted = await (async () => {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      if (findNode((n) => /Run \(green flag\)/i.test(n.desc || n.text))) return true;
      adb(['shell', 'sleep', '2'], { quiet: true });
    }
    return false;
  })();
  const loading = findNode((n) => /Loading/i.test(n.text));
  if (!booted || loading) {
    dumpFailure('scratch: stage did not finish booting (Loading hint still present)');
  }
  // Second sample: an init error replaces the WHOLE editor (Run/Stop row
  // included) with an error box — a single sample can race that transition.
  adb(['shell', 'sleep', '3'], { quiet: true });
  const stillRun = findNode((n) => /Run \(green flag\)/i.test(n.desc || n.text));
  const stillLoading = findNode((n) => /Loading/i.test(n.text));
  if (!stillRun || stillLoading) {
    dumpFailure('scratch: stage booted then errored out (Run row gone or Loading returned)');
  }
  log(step, 'scratch stage booted in the WebView (bridge ready, Loading hint cleared)');
  // The bundle emits the (default) project JSON on boot, so the submit
  // button is enabled without arranging blocks — submit it and watch the
  // transpiled project reach a verdict through the live judge.
  const submit = scrollUntilVisible(
    (n) =>
      (/^Submit$/i.test(n.text.trim()) || /^Submit$/i.test(n.desc.trim())) &&
      (n.clickable || n.tapTarget?.clickable),
  );
  if (!submit) {
    dumpFailure('scratch: submit button not found on the scratch page');
  }
  const submitTarget = submit.tapTarget ?? submit;
  adb(['shell', 'input', 'tap', String(submitTarget.center.x), String(submitTarget.center.y)]);
  await assertVisible(step, (n) => /^#\d+/.test(n.text.trim()), 90000);
  log(step, 'scratch submission judged through the live stack — flow PASSED');
}

// ---------------------------------------------------------------------------

const flows = {
  login: flowLoginAndBrowse,
  submit: flowSubmitSolution,
  scratch: flowScratchStage,
};

const which = process.argv[2] ?? 'all';
const toRun = which === 'all' ? Object.keys(flows) : [which];
if (toRun.some((f) => !flows[f])) {
  console.error(`unknown flow "${which}" (expected: login | submit | scratch | all)`);
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
