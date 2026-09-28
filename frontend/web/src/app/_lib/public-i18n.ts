// Server-side i18n for the PUBLIC page group (HomePage, ProblemsListPage,
// ProblemDetailPage, NotFoundPage).
//
// Ported from frontend/webcoder_ui (CRA reference), where these pages called
// react-i18next's `t(key, 'English default')` with ~90% fallback-English keys
// (docs/PORT-MAP.md §0.4). react-i18next only works inside client components,
// but these routes are SEO-facing Server Components, so this module provides
// the same `t(key, defaultValue, vars)` contract against a plain dictionary.
//
// Locale source: the CRA app caches its detected language in the `i18nextLng`
// cookie (src/i18n.ts detection.caches), so the server reads that cookie —
// this keeps SSR output locale-consistent with the hydrated client app
// without introducing [locale] URL routing (a scaffold-level decision).
//
// Behavior parity: MESSAGES mirrors the shared client resources
// (src/i18n.ts) for every key the public server pages render, in both
// locales, so SSR output is locale-consistent with the hydrated client app.
// The catalog's `difficulty_${...}` / `status_${...}` badges are DELIBERATELY
// absent — they render the raw backend enum via the defaultValue fallback
// (pinned by page tests and e2e/problems.spec.ts).

import { cookies } from 'next/headers';

export type PublicLocale = 'en' | 'ro';

const LOCALE_COOKIE_NAME = 'i18nextLng';

const MESSAGES: Record<PublicLocale, Record<string, string>> = {
  en: {
    // Parity with the shared resources (src/i18n.ts en block) for every key
    // the public server pages render.
    welcome_message: 'Welcome to WebCoder',
    problem_list_header: 'Problems',
    homepage_subtitle: 'The ultimate platform for competitive programming.',
    homepage_description:
      'Sharpen your skills, solve challenging problems, and compete with a community of developers from around the world. Whether you are a beginner or an expert, WebCoder has something for you.',
    view_problems_button: 'View Problems',
    sign_up_button: 'Sign Up',
    problems_page_description:
      'Browse the public competitive programming problem catalog on WebCoder.',
    no_problems_available: 'No problems available at the moment.',
    not_found_default_header: '404 - Page Not Found',
    not_found_default_message:
      'The page you are looking for does not exist or you may not have permission to view it.',
    difficulty_label: 'Difficulty',
    time_limit_label: 'Time Limit',
    memory_limit_label: 'Memory Limit',
    problem_id_label: 'Problem ID',
    problem_not_found: 'Problem not found.',
    problem_statement_header: 'Problem Statement',
    sample_test_cases_header: 'Sample Test Cases',
    sample_input_label: 'Sample Input',
    sample_output_label: 'Sample Output',
    solve_problem_description: 'Solve this problem on WebCoder.',
    submit_solution_header: 'Submit Solution',
  },
  ro: {
    // Parity with the shared resources (src/i18n.ts ro block).
    welcome_message: 'Bun venit la WebCoder',
    problem_list_header: 'Probleme',
    homepage_subtitle: 'Platforma definitivă pentru programare competitivă.',
    homepage_description:
      'Perfecționează-ți abilitățile, rezolvă probleme provocatoare și concurează alături de o comunitate de programatori din toată lumea. Fie că ești la început de drum sau expert, WebCoder are ceva pentru tine.',
    view_problems_button: 'Vezi Problemele',
    sign_up_button: 'Înscrie-te',
    problems_page_description:
      'Răsfoiește catalogul public de probleme de programare competitivă de pe WebCoder.',
    no_problems_available: 'Momentan nu sunt probleme disponibile.',
    not_found_default_header: '404 - Pagină Negăsită',
    not_found_default_message:
      'Pagina pe care o cauți nu există sau este posibil să nu ai permisiunea să o vezi.',
    difficulty_label: 'Dificultate',
    time_limit_label: 'Limită de timp',
    memory_limit_label: 'Limită de memorie',
    problem_id_label: 'ID-ul problemei',
    problem_not_found: 'Problema nu a fost găsită.',
    problem_statement_header: 'Enunțul Problemei',
    sample_test_cases_header: 'Exemple',
    sample_input_label: 'Intrare exemplu',
    sample_output_label: 'Ieșire exemplu',
    solve_problem_description: 'Rezolvă această problemă pe WebCoder.',
    submit_solution_header: 'Trimite o Soluție',
  },
};

/** Reduce a raw cookie value like "ro-RO" / "en-US" to the supported set. */
export function normalizeLocale(raw: string | undefined): PublicLocale {
  const base = raw?.split('-')[0]?.toLowerCase();
  return base === 'ro' ? 'ro' : 'en';
}

/** Resolve the render locale from the i18next cookie (default: English). */
export async function getLocale(): Promise<PublicLocale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE_NAME)?.value);
}

export interface TranslateVars {
  [key: string]: string | number;
}

/** Replace `{{name}}` placeholders, i18next-style. Missing vars become ''. */
export function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : ''
  );
}

export type PublicTranslator = (
  key: string,
  defaultValue?: string,
  vars?: TranslateVars
) => string;

/** Build a `t()` with the same (key, defaultValue, vars) contract as i18next. */
export function createTranslator(locale: PublicLocale): PublicTranslator {
  return (key, defaultValue = key, vars) =>
    interpolate(MESSAGES[locale][key] ?? defaultValue, vars);
}
