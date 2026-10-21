import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// [SPEC-GAPS A2] Design-token drift gate: raw hex colors must not appear in
// component/view TSX. Components use `var(--*)` (via globals.css) or import
// from '@/theme/tokens'. The grep is the CI-enforced equivalent of the
// backlog's suggested gate:
//   grep -rnE '#[0-9a-fA-F]{6}' src --include='*.tsx'
//
// Allowlist (files still carrying literal hex until their owning wave rewrites
// them — their DATA wiring belongs to Wave 3 F8/F9/F10, so this wave only
// avoids churning them):
//   - src/app/leaderboard/page.tsx   (Wave 3 F8 rewrites the whole page)
//   - src/app/forum/**               (Wave 3 F9)
//   - src/app/notifications/page.tsx (Wave 3 F10)
//   - src/theme/tokens.ts            (the SSOT itself — must be .ts, kept out
//     of the tsx grep anyway, listed here for documentation)

const ALLOWED = [
  'src/app/leaderboard/page.tsx',
  'src/app/notifications/page.tsx',
  'src/app/forum/page.tsx',
  'src/app/forum/new/page.tsx',
  'src/app/forum/ForumLiveClient.tsx',
  'src/app/forum/[threadId]/page.tsx',
  'src/theme/tokens.ts',
];

function hexOffenders(): string[] {
  let out: string;
  try {
    out = execSync(
      'git grep -nE "#[0-9a-fA-F]{6}\\b" -- "src/**/*.tsx" "src/**/*.ts"',
      { encoding: 'utf8' }
    );
  } catch (err) {
    // git grep exits 1 on zero matches — that is the desired green state.
    const status = (err as { status?: number }).status;
    if (status === 1) return [];
    throw err;
  }
  return out
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .filter((line) => {
      const file = line.split(':')[0];
      return !ALLOWED.includes(file) && !file.endsWith('.test.tsx') && !file.endsWith('.test.ts');
    });
}

describe('design-token gate: no raw hex in components [A2]', () => {
  it('reports no hardcoded hex colors outside the allowlist', () => {
    const offenders = hexOffenders();
    expect(
      offenders,
      `Raw hex found (use var(--*) or '@/theme/tokens' instead):\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('keeps the allowlist free of hex too (shrink it when waves land)', () => {
    // Guard against the allowlist becoming a dumping ground: every allowlisted
    // file must genuinely still contain hex, otherwise remove it here.
    const stillDirty = ALLOWED.filter((file) => {
      try {
        // ":(literal)" disables pathspec globbing so [threadId] matches verbatim.
        execSync(`git grep -qE "#[0-9a-fA-F]{6}\\b" -- ":(literal)${file}"`);
        return true;
      } catch {
        return false;
      }
    });
    const stale = ALLOWED.filter((f) => !stillDirty.includes(f) && f !== 'src/theme/tokens.ts');
    expect(stale, `allowlisted files with no hex left — remove from ALLOWED: ${stale}`).toEqual([]);
  });
});
