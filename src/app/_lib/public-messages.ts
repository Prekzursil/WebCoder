// Pure (client-safe) i18n dictionary for the PUBLIC page group.
//
// Split out of public-i18n.ts (which also resolves the locale cookie via
// next/headers and is therefore server-only): Next.js App Router forbids
// passing functions from Server Components to Client Components, so client
// islands like ProblemsListClient receive only the serializable `locale`
// string and build their own translator with createTranslator() from this
// module.
//
// [i18n wave] The dictionary is now DERIVED from the shared ten-locale
// catalogs (src/locales/*.json — the same source of truth as the client
// i18next resources) instead of being hand-maintained per locale: values
// can never drift between the two dictionaries again. PUBLIC_KEYS pins the
// subset the public server pages render; the catalogs'
// `difficulty_${...}` / `status_${...}` badges are DELIBERATELY absent —
// they render the raw backend enum via the defaultValue fallback (pinned by
// page tests and e2e/problems.spec.ts).

import en from '../../locales/en.json';
import ro from '../../locales/ro.json';
import es from '../../locales/es.json';
import fr from '../../locales/fr.json';
import de from '../../locales/de.json';
import pt from '../../locales/pt.json';
import it from '../../locales/it.json';
import pl from '../../locales/pl.json';
import hu from '../../locales/hu.json';
import ru from '../../locales/ru.json';
import uk from '../../locales/uk.json';
import bg from '../../locales/bg.json';
import el from '../../locales/el.json';
import zhHans from '../../locales/zh-Hans.json';
import ja from '../../locales/ja.json';
import ko from '../../locales/ko.json';
import hi from '../../locales/hi.json';
import vi from '../../locales/vi.json';
import th from '../../locales/th.json';
import id from '../../locales/id.json';
import tr from '../../locales/tr.json';
import ar from '../../locales/ar.json';
import fa from '../../locales/fa.json';
import { SUPPORTED_LOCALES, normalizeUiLocale, type Locale } from '../../i18n';

export type PublicLocale = Locale;

export const PUBLIC_LOCALES = SUPPORTED_LOCALES;

const CATALOGS: Record<PublicLocale, Record<string, unknown>> = {
  en,
  ro,
  es,
  fr,
  de,
  pt,
  it,
  pl,
  hu,
  ru,
  uk,
  bg,
  el,
  'zh-Hans': zhHans,
  ja,
  ko,
  hi,
  vi,
  th,
  id,
  tr,
  ar,
  fa,
};

/** The subset of catalog keys the public server pages render. */
export const PUBLIC_KEYS: string[] = [
  'welcome_message',
  'problem_list_header',
  'homepage_subtitle',
  'homepage_description',
  'view_problems_button',
  'sign_up_button',
  'problems_page_description',
  'no_problems_available',
  'not_found_default_header',
  'not_found_default_message',
  'difficulty_label',
  'time_limit_label',
  'memory_limit_label',
  'effective_limit_for',
  'problem_io_mode_label',
  'problem_partial_code_badge',
  'problem_io_stdio',
  'problem_restrictions_label',
  'problem_restriction_no_string_ops',
  'problem_restriction_banned',
  'problem_id_label',
  'problem_not_found',
  'problem_statement_header',
  'sample_test_cases_header',
  'sample_input_label',
  'sample_output_label',
  'solve_problem_description',
  'submit_solution_header',
  'problems_load_error',
  'hide_solved_toggle',
  'curriculum_label',
  'tags_label',
  'solved_column_th',
  'solved_aria',
  'attempted_aria',
  'not_attempted_aria',
  'start_here_banner',
  'start_page_title',
  'start_page_description',
  'start_hero_title',
  'start_hero_subtitle',
  'start_step_pick_label',
  'start_step_pick_title',
  'start_step_pick_body',
  'start_step_code_label',
  'start_step_code_title',
  'start_step_code_body',
  'start_step_judged_label',
  'start_step_judged_title',
  'start_step_judged_body',
  'start_starter_badge',
  'start_solve_now',
  'start_browse_all',
  'start_load_error',
  'start_empty',
  'terms_title',
  'support_title',
  'support_intro',
  'accessibility_title',
  'accessibility_intro',
  'accessibility_standard',
  'accessibility_keyboard',
  'accessibility_screenreaders',
  'accessibility_contrast',
  'accessibility_feedback',
  'accessibility_terms_link',
  'accessibility_privacy_link',
  'ai_policy_title',
  'ai_policy_intro',
  'ai_policy_own_work',
  'ai_policy_no_sharing',
  'ai_policy_one_account',
  'ai_policy_tools',
  'ai_policy_enforcement',
  'ai_policy_practice',
  'judge_docs_title',
  'judge_docs_intro',
  'judge_docs_limits',
  'judge_docs_language',
  'judge_docs_compile',
  'judge_docs_run',
  'judge_docs_limits_column',
  'judge_docs_time_multiplier',
  'judge_docs_memory_multiplier',
  'judge_docs_interpreted',
  'judge_docs_api_note',
  'contribute_title',
  'contribute_intro',
  'contribute_step_spec',
  'contribute_step_tests',
  'contribute_step_review',
  'contribute_step_reward',
  'contribute_cta_problem',
  'contribute_cta_judge',
  'contribute_cta_policy',
  'support_donate_title',
  'support_donate_body',
  'support_donate_cta',
  'support_sponsor_title',
  'support_sponsor_body',
  'support_sponsor_cta',
  'support_school_title',
  'support_school_body',
  'support_school_cta',
  'support_no_payments_note',
  'terms_updated',
  'terms_accounts_title',
  'terms_accounts_body',
  'terms_conduct_title',
  'terms_conduct_body',
  'terms_content_title',
  'terms_schools_title',
  'terms_schools_body',
  'terms_content_body',
  'terms_availability_title',
  'terms_availability_body',
  'privacy_title',
  'privacy_updated',
  'privacy_what_title',
  'privacy_what_body',
  'privacy_cookies_title',
  'privacy_cookies_body',
  'privacy_rights_title',
  'privacy_rights_body',
  'privacy_minors_title',
  'privacy_minors_body',
  'daily_problem_label',
  'editorial_header',
  'scratch_header',
  'problems_search_placeholder',
  'status_label',
  'all_option',
  'clear_filters_button',
  'showing_problems_info',
  'no_problems_match_filters',
  'sort_ascending',
  'sort_descending',
  'problem_author_label',
  'tags_header',
  'quick_links_header',
  'quick_link_my_submissions',
  'quick_link_submission_history',
  'quick_link_leaderboard',
  'quick_link_forum',
  'example_label',
  'empty_statement',
  'copy_button',
  'copied_label',
  'copy_link_button',
  'problem_type_interactive_badge',
  'problem_interactive_flush_notice',
  'previous_problem',
  'next_problem',
  'error_loading_problem',
  'back_to_problems',
  'discuss_problem_title',
  'discuss_problem_body',
  'go_to_forum_button',
  'not_found_code',
  'not_found_browse_problems',
  'not_found_go_home',
  'problem_form_allowed_languages',
  'loading_more',
  'load_more_problems',
  'home_badge',
  'home_stat_problems',
  'home_stat_languages',
  'home_stat_judge',
  'faq_heading',
  'faq_q1',
  'faq_a1',
  'faq_q2',
  'faq_a2',
  'faq_q3',
  'faq_a3',
  'faq_q4',
  'faq_a4',
];

function pick(catalog: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of PUBLIC_KEYS) {
    const value = catalog[key];
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/** Per-locale public dictionary — derived, never hand-maintained. */
export const MESSAGES: Record<PublicLocale, Record<string, string>> = {
  en: pick(CATALOGS.en),
  ro: pick(CATALOGS.ro),
  es: pick(CATALOGS.es),
  fr: pick(CATALOGS.fr),
  de: pick(CATALOGS.de),
  pt: pick(CATALOGS.pt),
  it: pick(CATALOGS.it),
  pl: pick(CATALOGS.pl),
  hu: pick(CATALOGS.hu),
  ru: pick(CATALOGS.ru),
  uk: pick(CATALOGS.uk),
  bg: pick(CATALOGS.bg),
  el: pick(CATALOGS.el),
  'zh-Hans': pick(CATALOGS['zh-Hans']),
  ja: pick(CATALOGS.ja),
  ko: pick(CATALOGS.ko),
  hi: pick(CATALOGS.hi),
  vi: pick(CATALOGS.vi),
  th: pick(CATALOGS.th),
  id: pick(CATALOGS.id),
  tr: pick(CATALOGS.tr),
  ar: pick(CATALOGS.ar),
  fa: pick(CATALOGS.fa),
};

/** Reduce a raw cookie value like "ro-RO" / "pt-BR" to the supported set. */
export function normalizeLocale(raw: string | undefined): PublicLocale {
  // Delegates to the canonical normalizer in src/i18n.ts: case-insensitive
  // canonicalization ('ZH-HANS' → 'zh-Hans') plus neutral-prefix mapping
  // (zh → zh-Hans, sr → sr-Latn), with EN as the universal fallback.
  return normalizeUiLocale(raw);
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

/** Build a `t()` with the same (key, defaultValue, vars) contract as i18next.
 * Falls back to the English entry before the inline default — the universal
 * fallback rule (owner requirement (d)) at dictionary level. */
export function createTranslator(locale: PublicLocale): PublicTranslator {
  return (key, defaultValue = key, vars) =>
    interpolate(MESSAGES[locale][key] ?? MESSAGES.en[key] ?? defaultValue, vars);
}
