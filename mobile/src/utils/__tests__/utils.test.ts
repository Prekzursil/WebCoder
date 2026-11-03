// Utils tests: statement resolution (user locale → EN fallback),
// effective limits math, partial-code template model, verdict/format.
import {
  computeEffectiveLimit,
  effectiveLimitsForProblem,
  formatLimitKb,
  formatLimitMs,
} from '../limits';
import {
  composeSubmission,
  initialSlots,
  isPartialCodeProblem,
  parseTemplate,
} from '../partialCode';
import {
  needsTranslation,
  problemStatement,
  problemTitle,
  resolveLocalized,
  translationCredit,
} from '../statement';
import {
  formatDateTime,
  formatKb,
  formatMs,
  pollDelayMs,
  verdictColor,
  verdictInProgress,
  verdictLabelKey,
  VERDICT_COLORS,
} from '../verdict';
import type { LanguageRow, ProblemType } from '../../types/api';

const lang = (id: string, t = 1, m = 1, floor = 0): LanguageRow => ({
  id,
  name: id,
  compile_command: [],
  run_command: [],
  time_multiplier: t,
  memory_multiplier: m,
  memory_floor_kb: floor,
  checker_capable: true,
});

describe('resolveLocalized / statement', () => {
  it('serves the user locale first', () => {
    const r = resolveLocalized({ ro: 'Salut', en: 'Hi' }, 'ro');
    expect(r).toEqual({ text: 'Salut', resolvedLocale: 'ro', native: true });
  });

  it('prefix-matches script variants (sr-Latn ↔ sr)', () => {
    const r = resolveLocalized({ sr: 'Zdravo', en: 'Hi' }, 'sr-Latn');
    expect(r.text).toBe('Zdravo');
    expect(r.native).toBe(true);
  });

  it('falls back to EN and flags non-native', () => {
    const r = resolveLocalized({ ro: 'Salut', en: 'Hello' }, 'fr');
    expect(r).toEqual({ text: 'Hello', resolvedLocale: 'en', native: false });
  });

  it('falls back to any locale when EN is missing', () => {
    const r = resolveLocalized({ de: 'Hallo' }, 'fr');
    expect(r.text).toBe('Hallo');
    expect(r.native).toBe(false);
  });

  it('handles undefined sources and empty values', () => {
    expect(resolveLocalized(undefined, 'ro').text).toBe('');
    expect(resolveLocalized({}, 'ro').resolvedLocale).toBe('');
    expect(resolveLocalized({ ro: '', en: 'EN' }, 'ro').text).toBe('EN');
  });

  it('exposes problem title/statement helpers and the translation credit', () => {
    const problem = {
      title_i18n: { en: 'Sum' },
      statement_i18n: { en: 'Given…', ro: 'Se dau…' },
      translations: [
        { language: 'ro', contributor_username: 'ana', reviewed_at: null },
      ],
    };
    expect(problemTitle(problem, 'ro').text).toBe('Sum');
    expect(problemStatement(problem, 'ro').text).toBe('Se dau…');
    expect(translationCredit(problem, 'ro')).toBe('ana');
    expect(translationCredit(problem, 'en')).toBeNull();
    expect(needsTranslation(problem, 'ro')).toBe(false);
    expect(needsTranslation(problem, 'fr')).toBe(true);
    expect(needsTranslation({ statement_i18n: undefined }, 'ro')).toBe(true);
  });
});

describe('effective limits (J5 judge fairness)', () => {
  const problem: ProblemType = {
    id: 1,
    title_i18n: {},
    difficulty: 'EASY',
    status: 'APPROVED',
    default_time_limit_ms: 1000,
    default_memory_limit_kb: 65536,
    effective_limits: { python3: { time_ms: 3000, memory_kb: 65536 } },
    limit_overrides: { cpp17: { time_ms: 2000 } },
    allowed_languages: ['python3', 'cpp17', 'csharp'],
  };

  it('multiplies defaults by the registry multipliers', () => {
    expect(
      computeEffectiveLimit(problem, lang('python3', 3, 1))
    ).toEqual({ language: 'python3', timeMs: 3000, memoryKb: 65536 });
  });

  it('applies per-language overrides before multipliers', () => {
    expect(computeEffectiveLimit(problem, lang('cpp17')).timeMs).toBe(2000);
  });

  it('enforces the memory floor', () => {
    expect(
      computeEffectiveLimit(problem, lang('csharp', 2, 1, 524288)).memoryKb
    ).toBe(524288);
  });

  it('prefers pre-resolved effective_limits and filters allowed languages', () => {
    const limits = effectiveLimitsForProblem(problem, [
      lang('python3'),
      lang('cpp17'),
      lang('java11'), // not allowed → filtered out
    ]);
    expect(limits.map((l) => l.language)).toEqual(['python3', 'cpp17']);
    expect(limits[0].timeMs).toBe(3000); // from effective_limits
  });

  it('returns [] for an empty registry and formats human units', () => {
    expect(effectiveLimitsForProblem(problem, [])).toEqual([]);
    expect(formatLimitMs(1500)).toBe('1.5 s');
    expect(formatLimitMs(2000)).toBe('2 s');
    expect(formatLimitMs(850)).toBe('850 ms');
    expect(formatLimitKb(2048)).toBe('2 MB');
    expect(formatLimitKb(900)).toBe('900 KB');
  });
});

describe('partial-code templates', () => {
  it('parses locked/editable segments with comment-prefixed sentinels', () => {
    const template = [
      '#include <bits/stdc++.h>',
      '// WC_EDIT_START',
      '// your code here',
      '// WC_EDIT_END',
      'int main() {}',
    ].join('\n');
    const segments = parseTemplate(template);
    expect(segments).toEqual([
      { locked: true, text: '#include <bits/stdc++.h>' },
      { locked: false, text: '// your code here' },
      { locked: true, text: 'int main() {}' },
    ]);
  });

  it('handles # and bare sentinels, unterminated edit regions, empties', () => {
    expect(parseTemplate(null)).toEqual([]);
    expect(parseTemplate('')).toEqual([]);
    const py = 'n = int(input())\n# WC_EDIT_START\n# TODO\nWC_EDIT_END\nprint(n)';
    expect(parseTemplate(py)).toEqual([
      { locked: true, text: 'n = int(input())' },
      { locked: false, text: '# TODO' },
      { locked: true, text: 'print(n)' },
    ]);
    // An UNTERMINATED edit region drops its buffer at EOF (web parity:
    // only lockedBuf is flushed at the end — a template missing
    // WC_EDIT_END is malformed and its trailing content is discarded).
    expect(parseTemplate('a\nWC_EDIT_START\nlost')).toEqual([
      { locked: true, text: 'a' },
    ]);
  });

  it('round-trips slots through composeSubmission', () => {
    const template = 'A\nWC_EDIT_START\none\nWC_EDIT_END\nB\nWC_EDIT_START\ntwo\nWC_EDIT_END\nC';
    const segments = parseTemplate(template);
    const slots = initialSlots(segments);
    expect(slots).toEqual(['one', 'two']);
    expect(composeSubmission(segments, ['X', 'Y'])).toBe('A\nX\nB\nY\nC');
    // missing slot values default to empty
    expect(composeSubmission(segments, ['X'])).toBe('A\nX\nB\n\nC');
  });

  it('flags partial-code problems', () => {
    expect(isPartialCodeProblem({ code_template: 'x' })).toBe(true);
    expect(isPartialCodeProblem({})).toBe(false);
    expect(isPartialCodeProblem({ code_template: null })).toBe(false);
  });
});

describe('verdict + formatting', () => {
  it('maps verdicts to colors, keys, and progress', () => {
    expect(verdictColor('AC')).toBe(VERDICT_COLORS.AC);
    expect(verdictColor('UNKNOWN')).toBeTruthy();
    expect(verdictColor(undefined)).toBeTruthy();
    expect(verdictLabelKey('AC')).toBe('verdict_ac');
    expect(verdictInProgress('PENDING')).toBe(true);
    expect(verdictInProgress('COMPILING')).toBe(true);
    expect(verdictInProgress('RUNNING')).toBe(true);
    expect(verdictInProgress('AC')).toBe(false);
    expect(verdictInProgress(undefined)).toBe(false);
  });

  it('formats durations, memory and dates; polls 1s then 2s', () => {
    expect(formatMs(2400)).toBe('2.4 s');
    expect(formatMs(3000)).toBe('3 s');
    expect(formatMs(120)).toBe('120 ms');
    expect(formatKb(1536)).toBe('1.5 MB');
    expect(formatKb(2048)).toBe('2 MB');
    expect(formatKb(500)).toBe('500 KB');
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('not-a-date')).toBe('not-a-date');
    expect(formatDateTime('2026-11-02T14:03:00Z')).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/
    );
    expect(pollDelayMs(0)).toBe(1000);
    expect(pollDelayMs(4)).toBe(1000);
    expect(pollDelayMs(5)).toBe(2000);
  });
});
