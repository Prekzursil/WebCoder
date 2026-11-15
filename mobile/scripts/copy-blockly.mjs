// Copy the official Blockly UMD bundles into the app's assets so the
// block editor (src/ui/BlocklyEditor.tsx) can load them inside a WebView
// with zero network dependency. Mirrors scripts/copy-locales.mjs: run
// after `npm install` and whenever the pinned `blockly` version moves.
//
// Files are renamed to *.txt — Metro treats unknown-in-assetExts
// extensions as code, and `.js` under assets/ would be parsed as a
// module; `.txt` is a default Metro asset extension, so require() gives
// an expo-asset module whose bytes we read at runtime.
//
// Usage: npm run copy-blockly   (from mobile/)
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const mobileRoot = resolve(here, '..');
const require = createRequire(import.meta.url);

// Resolve the pinned blockly package (mobile devDependency; the same
// major the web app uses — see mobile/package.json). blockly's package
// `exports` map hides package.json, so resolve the entry point and take
// the package root off its path instead.
const entryPath = require.resolve('blockly');
// Windows resolves with backslashes — match either separator.
const marker = /[/\\]node_modules[/\\]blockly[/\\]/;
const match = marker.exec(entryPath);
if (!match) throw new Error(`cannot locate blockly package under ${entryPath}`);
const blocklyDir = entryPath.slice(0, match.index + match[0].length);
const outDir = join(mobileRoot, 'assets', 'blockly');

/** The UMD files the WebView needs (core, built-in blocks, both
 * generators used by block problems, and the two message packs the
 * platform ships — the web editor localizes to ro or en only). */
const FILES = [
  ['blockly_compressed.js', 'core.txt'],
  ['blocks_compressed.js', 'blocks.txt'],
  ['python_compressed.js', 'python.txt'],
  ['javascript_compressed.js', 'javascript.txt'],
  ['msg/en.js', 'messages-en.txt'],
  ['msg/ro.js', 'messages-ro.txt'],
];

function totalSize(dir) {
  let size = 0;
  for (const name of readdirSync(dir)) {
    const stat = statSync(join(dir, name));
    size += stat.isFile() ? stat.size : totalSize(join(dir, name));
  }
  return size;
}

mkdirSync(outDir, { recursive: true });
for (const [src, dest] of FILES) {
  copyFileSync(join(blocklyDir, src), join(outDir, dest));
  console.log(`blockly: ${src} -> assets/blockly/${dest}`);
}
console.log(`blockly: copied ${FILES.length} files (~${Math.round(totalSize(outDir) / 1024)} KB)`);
