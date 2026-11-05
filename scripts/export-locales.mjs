// Copies src/locales/*.json to public/locales/*.json — the static message
// catalogs the future MOBILE APP (and any companion tooling) consumes.
// The vitest parity test (src/i18n.parity.test.ts) asserts the copies
// match the catalogs, so they can never drift; run this after editing any
// catalog. Kept checked-in so the shipped files are reviewable.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "src", "locales");
const dest = path.join(root, "public", "locales");
fs.mkdirSync(dest, { recursive: true });

const locales = fs
  .readdirSync(src)
  .filter((f) => f.endsWith(".json"))
  .sort();

for (const file of locales) {
  const text = fs.readFileSync(path.join(src, file), "utf8");
  JSON.parse(text); // fail loudly on a broken catalog
  fs.writeFileSync(path.join(dest, file), text);
  console.log(`public/locales/${file} (${text.length} bytes)`);
}
console.log(`Exported ${locales.length} locale catalogs.`);
