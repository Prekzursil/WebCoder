// Validate a locale catalog against en.json: identical key sets, identical
// {{placeholder}} sets per key, JSON validity, and (sanity) no unexpected
// script contamination (e.g. Cyrillic/CJK glyphs inside a Latin-script
// catalog). Usage: node tools-i18n-check.cjs <code> [code...]
// NOTE: scratch tool for this wave — not wired into CI (the vitest parity
// test is); kept because it gives per-catalog feedback in milliseconds.
import fs from "node:fs";
import path from "node:path";

function* flat(o, p = "") {
  for (const [k, v] of Object.entries(o)) {
    const kk = p ? p + "." + k : k;
    if (v && typeof v === "object") yield* flat(v, kk);
    else yield [kk, v];
  }
}

// Codepoint ranges a Latin-script locale may use: ASCII + Latin-1 +
// Latin Extended-A/B, Latin Extended Additional (Vietnamese), general
// punctuation + superscripts, arrows + math operators, technical /
// geometric / misc symbols + dingbats, misc-symbols-and-arrows, UTF-16
// surrogates (astral emoji), Latin ligatures.
const ALLOWED_RANGES = [
  [0x0000, 0x024f],
  [0x1e00, 0x1eff],
  [0x2000, 0x209f],
  [0x2190, 0x22ff],
  [0x2300, 0x27bf],
  [0x2b00, 0x2bff],
  [0xd800, 0xdfff],
  [0xfb00, 0xfbef],
];
function inAllowed(cp) {
  if (cp > 0xffff) return true; // astral plane = emoji in this UI's vocabulary
  return ALLOWED_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
}

// Locales whose scripts are non-Latin — the contamination check is skipped
// (the key-set + placeholder + identical-to-EN gates still apply).
const NON_LATIN_LOCALES = new Set([
  "zh-Hans",
  "zh-Hant",
  "ja",
  "ko",
  "hi",
  "th",
  "ar",
  "fa",
  "el",
  "bg",
  "ru",
  "uk",
  "kk",
  "he",
  "rmy",
  "sr-Cyrl",
]);

const enEntries = [
  ...flat(JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/locales/en.json"), "utf8"))),
];
const enKeys = new Set(enEntries.map(([k]) => k));
const enMap = new Map(enEntries);
const enPh = new Map(
  enEntries.map(([k, v]) => [k, (String(v).match(/{{[^}]+}}/g) || []).sort().join(",")]),
);
let bad = 0;

for (const code of process.argv.slice(2)) {
  const file = path.join(process.cwd(), "src/locales", code + ".json");
  let cat;
  try {
    cat = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.log(`${code}: INVALID JSON — ${e.message}`);
    bad++;
    continue;
  }
  const entries = [...flat(cat)];
  const keys = new Set(entries.map(([k]) => k));
  const onlyEn = [...enKeys].filter((k) => !keys.has(k));
  const onlyLoc = [...keys].filter((k) => !enKeys.has(k));
  if (onlyEn.length) {
    console.log(
      `${code}: MISSING ${onlyEn.length} keys: ${onlyEn.slice(0, 8).join(", ")}${onlyEn.length > 8 ? "…" : ""}`,
    );
    bad++;
  }
  if (onlyLoc.length) {
    console.log(
      `${code}: EXTRA ${onlyLoc.length} keys: ${onlyLoc.slice(0, 8).join(", ")}${onlyLoc.length > 8 ? "…" : ""}`,
    );
    bad++;
  }
  let phBad = 0;
  for (const [k, v] of entries) {
    if (!enKeys.has(k)) continue;
    const ph = (String(v).match(/{{[^}]+}}/g) || []).sort().join(",");
    if (ph !== enPh.get(k)) {
      console.log(`${code}: placeholder mismatch at ${k}: expected [${enPh.get(k)}] got [${ph}]`);
      phBad++;
    }
  }
  if (phBad) bad++;
  const contam = [];
  if (!NON_LATIN_LOCALES.has(code)) {
    for (const [k, v] of entries) {
      for (const ch of String(v)) {
        const cp = ch.codePointAt(0);
        if (!inAllowed(cp)) {
          contam.push(`${k}: ${ch} (U+${cp.toString(16)})`);
          break;
        }
      }
    }
    if (contam.length) {
      console.log(
        `${code}: SCRIPT CONTAMINATION in ${contam.length} keys (first 5): ${contam.slice(0, 5).join(" | ")}`,
      );
      bad++;
    }
  }
  if (!onlyEn.length && !onlyLoc.length && !phBad && !contam.length) {
    let total = 0;
    let identical = 0;
    for (const [k, v] of entries) {
      const enV = String(enMap.get(k) ?? "");
      if (enV.length <= 3) continue;
      total++;
      if (String(v) === enV) identical++;
    }
    console.log(
      `${code}: OK — ${entries.length} keys, placeholders intact, ${((100 * identical) / total).toFixed(1)}% identical to EN`,
    );
  }
}
process.exit(bad ? 1 : 0);
