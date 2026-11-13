// Copies the web app's UI message catalogs (../src/locales/*.json) into
// mobile/src/i18n/locales/ — the mobile app consumes the SAME catalogs, so
// every shipped UI language is selectable in the app (owner requirement).
// A parity test (src/i18n/__tests__/parity.test.ts) asserts the copies
// match the source catalogs, so they can never drift; re-run this after
// any web catalog change.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "..", "..", "src", "locales");
const dest = path.join(here, "..", "src", "i18n", "locales");
fs.mkdirSync(dest, { recursive: true });

const locales = fs
  .readdirSync(src)
  .filter((f) => f.endsWith(".json"))
  .sort();

for (const file of locales) {
  const text = fs.readFileSync(path.join(src, file), "utf8");
  JSON.parse(text); // fail loudly on a broken catalog
  fs.writeFileSync(path.join(dest, file), text);
  console.log(`mobile/src/i18n/locales/${file} (${text.length} bytes)`);
}
console.log(`Copied ${locales.length} locale catalogs from the web app.`);
