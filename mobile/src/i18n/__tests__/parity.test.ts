// Locale-copy parity: the mobile catalogs must stay verbatim copies of
// the web app's src/locales/*.json (the mobile app consumes the SAME
// catalogs — owner rule). Re-run `node scripts/copy-locales.mjs` after
// editing any web catalog.
import { describe, expect, it } from '@jest/globals';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SUPPORTED_LOCALES } from '../index';

const mobileLocales = join(__dirname, '..', 'locales');
const webLocales = join(__dirname, '..', '..', '..', '..', '..', 'src', 'locales');

describe('locale catalog copies', () => {
  it('ships exactly the SUPPORTED_LOCALES set', () => {
    const files = readdirSync(mobileLocales)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''))
      .sort();
    expect(files).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it('matches the web app catalogs byte-for-byte (when run in-repo)', () => {
    if (!existsSync(webLocales)) {
      // Standalone mobile checkout (e.g. EAS build): the copies are
      // committed, so only the web worktree run enforces parity.
      return;
    }
    for (const file of readdirSync(mobileLocales)) {
      const mobile = readFileSync(join(mobileLocales, file), 'utf8');
      const web = readFileSync(join(webLocales, file), 'utf8');
      expect(mobile).toBe(web);
    }
  });
});
