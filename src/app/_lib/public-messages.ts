// Pure (client-safe) i18n dictionary for the PUBLIC page group.
//
// Split out of public-i18n.ts (which also resolves the locale cookie via
// next/headers and is therefore server-only): Next.js App Router forbids
// passing functions from Server Components to Client Components, so client
// islands like ProblemsListClient receive only the serializable `locale`
// string and build their own translator with createTranslator() from this
// module.
//
// MESSAGES mirrors the shared client resources (src/i18n.ts) for every key
// the public server pages render, in both locales, so SSR output is
// locale-consistent with the hydrated client app. The catalog's
// `difficulty_${...}` / `status_${...}` badges are DELIBERATELY absent —
// they render the raw backend enum via the defaultValue fallback (pinned by
// page tests and e2e/problems.spec.ts).

export type PublicLocale = 'en' | 'ro';

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
    // Catalog filter chrome [Q3 / F3]
    problems_load_error: 'Could not load problems: ',
    problems_search_placeholder: 'Search problems…',
    status_label: 'Status',
    all_option: 'All',
    clear_filters_button: '✕ Clear',
    showing_problems_info: 'Showing {{shown}} of {{total}} problem(s)',
    no_problems_match_filters: 'No problems match your filters.',
    sort_ascending: 'Sort ascending',
    sort_descending: 'Sort descending',
    // Problem detail polish [A1/A11/A18]
    problem_author_label: 'Author',
    tags_header: 'Tags',
    quick_links_header: 'Quick Links',
    quick_link_my_submissions: 'My Submissions',
    quick_link_submission_history: 'Submission History',
    quick_link_leaderboard: 'Leaderboard',
    quick_link_forum: 'Community Forum',
    example_label: 'Example {{n}}',
    empty_statement: 'No statement available.',
    copy_button: 'Copy',
    copied_label: 'Copied!',
    copy_link_button: 'Copy link',
    previous_problem: 'Previous problem',
    next_problem: 'Next problem',
    error_loading_problem: 'Failed to load problem.',
    back_to_problems: 'Back to Problems',
    discuss_problem_title: 'Discuss this problem',
    discuss_problem_body: 'Ask for hints or share your approach in the community forum.',
    go_to_forum_button: 'Go to Forum →',
    // 404 [A14]
    not_found_code: '404',
    not_found_browse_problems: 'Browse Problems',
    not_found_go_home: 'Go Home',
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
    // Catalog filter chrome [Q3 / F3]
    problems_load_error: 'Nu s-au putut încărca problemele: ',
    problems_search_placeholder: 'Caută probleme…',
    status_label: 'Status',
    all_option: 'Toate',
    clear_filters_button: '✕ Șterge',
    showing_problems_info: 'Se afișează {{shown}} din {{total}} probleme',
    no_problems_match_filters: 'Nicio problemă nu corespunde filtrelor.',
    sort_ascending: 'Sortează crescător',
    sort_descending: 'Sortează descrescător',
    // Problem detail polish [A1/A11/A18]
    problem_author_label: 'Autor',
    tags_header: 'Etichete',
    quick_links_header: 'Linkuri Rapide',
    quick_link_my_submissions: 'Submisiile Mele',
    quick_link_submission_history: 'Istoric Submisii',
    quick_link_leaderboard: 'Clasament',
    quick_link_forum: 'Forumul Comunității',
    example_label: 'Exemplul {{n}}',
    empty_statement: 'Nu există enunț disponibil.',
    copy_button: 'Copiază',
    copied_label: 'Copiat!',
    copy_link_button: 'Copiază linkul',
    previous_problem: 'Problema anterioară',
    next_problem: 'Problema următoare',
    error_loading_problem: 'Încărcarea problemei a eșuat.',
    back_to_problems: 'Înapoi la Probleme',
    discuss_problem_title: 'Discută această problemă',
    discuss_problem_body: 'Cere indicii sau împărtășește-ți abordarea în forumul comunității.',
    go_to_forum_button: 'Mergi la Forum →',
    // 404 [A14]
    not_found_code: '404',
    not_found_browse_problems: 'Vezi Problemele',
    not_found_go_home: 'Mergi la Pagina Principală',
  },
};

/** Reduce a raw cookie value like "ro-RO" / "en-US" to the supported set. */
export function normalizeLocale(raw: string | undefined): PublicLocale {
  const base = raw?.split('-')[0]?.toLowerCase();
  return base === 'ro' ? 'ro' : 'en';
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
