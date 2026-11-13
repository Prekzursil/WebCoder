// Per-language effective limits — mobile twin of the web's judge-fairness
// display (J5/JDG-5): the judge multiplies a problem's default limits by
// each language's multipliers (and applies a memory floor); the backend
// pre-resolves these into `effective_limits`, and this module computes
// them client-side from the public language registry when the field is
// absent (e.g. cached problems from an older API).
import type { LanguageRow, ProblemType } from '../types/api';

export interface EffectiveLimit {
  language: string;
  timeMs: number;
  memoryKb: number;
}

/** The judge's exact math for one language (backend judge_fairness). */
export function computeEffectiveLimit(
  problem: Pick<
    ProblemType,
    'default_time_limit_ms' | 'default_memory_limit_kb' | 'limit_overrides'
  >,
  language: LanguageRow,
): EffectiveLimit {
  const override = problem.limit_overrides?.[language.id] ?? {};
  const baseTime = override.time_ms ?? problem.default_time_limit_ms ?? 1000;
  const baseMemory = override.memory_kb ?? problem.default_memory_limit_kb ?? 262144;
  return {
    language: language.id,
    timeMs: Math.round(baseTime * language.time_multiplier),
    memoryKb: Math.max(
      Math.round(baseMemory * language.memory_multiplier),
      language.memory_floor_kb,
    ),
  };
}

/**
 * Effective limits for the picker's languages. Prefers the backend's
 * pre-resolved `effective_limits` entries; computes the rest from the
 * registry. Ordered by the registry order, filtered to the problem's
 * allowed languages when declared.
 */
export function effectiveLimitsForProblem(
  problem: ProblemType,
  registry: LanguageRow[],
): EffectiveLimit[] {
  const allowed = problem.allowed_languages;
  return registry
    .filter((lang) => !allowed || allowed.includes(lang.id))
    .map((lang) => {
      const pre = problem.effective_limits?.[lang.id];
      if (pre) return { language: lang.id, timeMs: pre.time_ms, memoryKb: pre.memory_kb };
      return computeEffectiveLimit(problem, lang);
    });
}

/** Human form: ms→s when ≥1000; KB→MB when ≥1024. */
export function formatLimitMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)} s` : `${ms} ms`;
}

export function formatLimitKb(kb: number): string {
  return kb >= 1024 ? `${Math.round(kb / 1024)} MB` : `${kb} KB`;
}
