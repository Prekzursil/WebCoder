#!/usr/bin/env node
// Builds the mobile Scratch editor WebView bundle: an esbuild IIFE that
// carries the SAME stack the web ScratchEditor.tsx mounts (scratch-vm +
// scratch-blocks vertical + scratch-render + scratch-storage), wired the
// way scratch-gui wires them, plus the Scratch-cat/backdrop assets and
// the scratch-blocks media set inlined as data URIs (the WebView loads
// the page from an HTML string — no server, no relative URLs). Run from
// the REPO ROOT (the scratch packages live in the root node_modules,
// same arrangement as the web editor):
//
//   node mobile/scripts/build-scratch.mjs
//
// Output: mobile/assets/scratch/editor.txt (committed, like the Blockly
// UMD bundles copied by copy-blockly.mjs). Re-run after any scratch-*
// version bump.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mobileRoot = resolve(here, '..');
const repoRoot = resolve(mobileRoot, '..');
const outDir = join(mobileRoot, 'assets', 'scratch');
const require = createRequire(join(repoRoot, 'package.json'));

// The default-project assets bundled by the web app (public/scratch-assets)
// and the FULL scratch-blocks media set (65 icon/cursor files, ~144KB —
// audio excluded) inlined as data URIs.
const blocksPkg = resolve(require.resolve('scratch-blocks/package.json'), '..');
const mediaDir = join(blocksPkg, 'media');
const media = {};
function walkMedia(dir, prefix = '') {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walkMedia(join(dir, entry.name), rel);
    } else if (!/\.(mp3|ogg|wav)$/.test(entry.name)) {
      const data = readFileSync(join(dir, entry.name));
      const mime = entry.name.endsWith('.svg')
        ? 'image/svg+xml'
        : entry.name.endsWith('.gif')
          ? 'image/gif'
          : entry.name.endsWith('.png')
            ? 'image/png'
            : entry.name.endsWith('.cur')
              ? 'image/x-icon'
              : 'application/octet-stream';
      media[rel] = `data:${mime};base64,${data.toString('base64')}`;
    }
  }
}
walkMedia(mediaDir);
const bundledAssets = {
  // The Scratch cat costume and the default backdrop (verified md5s —
  // the same two files the web app serves from public/scratch-assets).
  bcf454acf82e4504149f7ffe07081dbc: readFileSync(
    join(repoRoot, 'public', 'scratch-assets', 'bcf454acf82e4504149f7ffe07081dbc.svg'),
  ).toString('base64'),
  cd21514d0531fdffb22204e0ec5ed84a: readFileSync(
    join(repoRoot, 'public', 'scratch-assets', 'cd21514d0531fdffb22204e0ec5ed84a.svg'),
  ).toString('base64'),
};

// RO block labels from the official scratch-l10n catalog (EN is baked
// into scratch-blocks). Applied at init when the caller passes locale
// 'ro…' — same mechanism scratch-gui uses.
let roMessages = null;
try {
  roMessages = readFileSync(
    resolve(require.resolve('scratch-l10n/package.json'), '..', 'editor', 'blocks', 'ro.json'),
  ).toString();
} catch {
  roMessages = null; // catalog missing -> EN-only
}

// The editor entry: the wiring that mirrors the web ScratchEditor.tsx
// effect (storage + builtin assets, vm/renderer, blocks inject, project
// load/export, SAY bridge) behind a window.WebCoderScratch handle.
//
// Interop note (verified on the API-35 emulator): this bundle is CJS
// format, so esbuild hands the RAW module.exports to require() — the
// scratch UMD builds have NO .default (scratch-vm exports the class
// directly, scratch-render exports {ScratchRender}, scratch-blocks the
// Blockly object). A plain `.default` access yields undefined and the
// stage dies with "<minified> is not a constructor" on the first
// `new VirtualMachine()`. Resolve each export by every name it can take.
const ENTRY = `
const vmModule = require('scratch-vm');
const VirtualMachine = vmModule.VirtualMachine || vmModule.default || vmModule;
const renderModule = require('scratch-render');
const ScratchRender = renderModule.ScratchRender || renderModule.default || renderModule;
const storageModule = require('scratch-storage');
const ScratchStorage = storageModule.ScratchStorage || storageModule.default || storageModule;
const AssetType = storageModule.AssetType;
const blocklyModule = require('scratch-blocks/dist/vertical.js');
const Blockly = blocklyModule.default || blocklyModule;
const MEDIA = ${JSON.stringify(media)};
const BUNDLED_ASSETS = ${JSON.stringify(bundledAssets)};
const RO_MESSAGES = ${roMessages};

function report(type, payload) {
  try {
    window.ReactNativeWebView.postMessage(
      JSON.stringify(Object.assign({ type: type }, payload || {})),
    );
  } catch (_) {}
}

// The WebView document has no base URL: rewrite every scratch-blocks
// media reference (Blockly builds '<path>/<name>' hrefs at runtime) to
// the inlined data URI, for icons already in the DOM and for the ones
// the flyout/mutators create later.
function patchMediaImages() {
  var fix = function (el) {
    var href = el.getAttribute('xlink:href') || el.getAttribute('href') || '';
    if (href.indexOf('/scratch-blocks-media/') === -1) return;
    var name = href.split('/').pop();
    if (MEDIA[name]) {
      el.setAttribute('href', MEDIA[name]);
      el.removeAttribute('xlink:href');
    }
  };
  var all = document.querySelectorAll('image');
  for (var i = 0; i < all.length; i++) fix(all[i]);
  new MutationObserver(function (muts) {
    for (var m = 0; m < muts.length; m++) {
      var mut = muts[m];
      if (mut.type === 'attributes') {
        fix(mut.target);
      } else {
        var nodes = mut.addedNodes;
        for (var n = 0; n < nodes.length; n++) {
          var node = nodes[n];
          if (node.querySelectorAll) {
            var imgs = node.querySelectorAll('image');
            for (var k = 0; k < imgs.length; k++) fix(imgs[k]);
          }
        }
      }
    }
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['xlink:href', 'href'],
  });
}

var vm = null;
var currentProject = null;

window.WebCoderScratch = {
  init: function (cfg) {
    try {
      patchMediaImages();
      if (cfg.locale && cfg.locale.indexOf('ro') === 0 && RO_MESSAGES) {
        var ro = JSON.parse(RO_MESSAGES);
        for (var key in ro) Blockly.Msg[key] = ro[key];
      }
      var storage = new ScratchStorage();
      var builtin = storage.builtinHelper;
      Object.keys(BUNDLED_ASSETS).forEach(function (md5) {
        var bin = atob(BUNDLED_ASSETS[md5]);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        builtin.store(AssetType.ImageVector, 'svg', bytes.buffer, md5);
      });

      vm = new VirtualMachine();
      vm.attachStorage(storage);
      var canvas = document.getElementById('wc-stage');
      if (canvas) {
        try {
          vm.attachRenderer(new ScratchRender(canvas));
        } catch (e) {
          // No WebGL (locked-down GPU): block editing and project export
          // stay fully functional without the stage — same fallback as
          // the web editor.
        }
      }
      vm.start();
      vm.runtime.on('SAY', function (_target, type, text) {
        if (type === 'say' || type === 'think') report('say', { text: String(text == null ? '' : text) });
      });

      var workspace = Blockly.inject(document.getElementById('wc-blocks'), {
        toolbox: cfg.toolbox,
        media: '/scratch-blocks-media/',
        zoom: { controls: true, startScale: 0.675, maxScale: 1.5, minScale: 0.25 },
        trashcan: true,
        grid: { spacing: 40, natural: true },
        sounds: false,
      });
      workspace.addChangeListener(vm.blockListener);
      vm.on('workspaceUpdate', function (data) {
        Blockly.Xml.clearWorkspaceAndLoadFromXml(
          Blockly.Xml.textToDom(data.xml),
          workspace,
        );
      });
      vm.on('PROJECT_CHANGED', function () {
        try {
          currentProject = vm.toJSON();
          report('project', { json: currentProject });
        } catch (_) {
          // serialization races during block deletion; the next event re-exports
        }
      });

      var starter = cfg.projectJson ? JSON.parse(cfg.projectJson) : null;
      vm.loadProject(starter || JSON.parse(cfg.defaultProject))
        .then(function () {
          vm.emitWorkspaceUpdate();
          currentProject = vm.toJSON();
          report('project', { json: currentProject });
          report('ready', {});
        })
        .catch(function (err) {
          // A creator-supplied starter that fails validation falls back
          // to the default cat project — the editor stays usable.
          vm.loadProject(JSON.parse(cfg.defaultProject))
            .then(function () {
              vm.emitWorkspaceUpdate();
              currentProject = vm.toJSON();
              report('project', { json: currentProject });
              report('ready', {});
            })
            .catch(function (err2) {
              report('error', {
                // Fold the stack into the message: minified one-liners
                // ("ED is not a constructor") are undiagnosable alone, and
                // the RN bridge only forwards .message.
                message:
                  String((err2 && err2.message) || err2) +
                  ' :: ' +
                  String((err2 && err2.stack) || '').slice(0, 400),
              });
            });
        });
    } catch (e) {
      report('error', {
        // Fold the stack into the message (see the note above).
        message:
          String((e && e.message) || e) + ' :: ' + String((e && e.stack) || '').slice(0, 400),
      });
    }
  },
  greenFlag: function () {
    if (vm) vm.greenFlag();
  },
  stopAll: function () {
    if (vm) vm.stopAll();
  },
};
report('boot', {});
`;

mkdirSync(outDir, { recursive: true });

await build({
  // stdin entry: the wiring lives only in memory (no intermediate file
  // lands inside the repo — biome gates the tree), while resolveDir
  // anchors bare imports to the repo root's node_modules.
  stdin: {
    contents: ENTRY,
    resolveDir: repoRoot,
    loader: 'js',
  },
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome100'],
  outfile: join(outDir, 'editor.txt'),
  logLevel: 'info',
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
});
console.log(`scratch editor bundle written to ${join(outDir, 'editor.txt')}`);
