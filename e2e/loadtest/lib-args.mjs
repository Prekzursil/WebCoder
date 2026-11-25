// Item 138 (wave G section J) — load-test CLI parsing, importable so it is
// unit-tested (e2e/loadtest/lib-args.test.ts) while replay.mjs stays a thin
// runner.
//
// Every flag accepts both spellings:
//   --name=value
//   --name value      (the usage block below replay.mjs and the nightly
//                      workflow's invocation)
// A flag that is absent — or present without a value (end of argv, or
// followed by another flag) — takes its default.

/** Is `token` a flag name rather than a value (starts with `--`)? */
function isFlag(token) {
  return typeof token === 'string' && token.startsWith('--');
}

/** Value of `--name` in `argv` (either spelling), else `fallback`. */
export function readFlag(argv, name, fallback) {
  const prefix = `--${name}=`;
  const inline = argv.find((token) => typeof token === 'string' && token.startsWith(prefix));
  if (inline !== undefined) return inline.slice(prefix.length);
  const index = argv.indexOf(`--${name}`);
  if (index !== -1) {
    const next = argv[index + 1];
    if (next !== undefined && !isFlag(next)) return next;
  }
  return fallback;
}

/** Resolve every `[name, fallback]` pair of `defaults` against `argv`. */
export function parseArgs(argv, defaults) {
  const parsed = {};
  for (const [name, fallback] of Object.entries(defaults)) {
    parsed[name] = readFlag(argv, name, fallback);
  }
  return parsed;
}

/**
 * Fail fast on a numeric flag that is not a positive integer. Returns the
 * validated number; a bad value throws with the flag named, so a mistyped
 * invocation (an empty `--problem ""`, a non-numeric `--users`) can never
 * run the drill against a default nobody asked for.
 */
export function positiveInt(value, name) {
  const number = Number(value);
  if (value === '' || !Number.isInteger(number) || number < 1) {
    throw new Error(`--${name} must be a positive integer, got ${JSON.stringify(value)}`);
  }
  return number;
}
