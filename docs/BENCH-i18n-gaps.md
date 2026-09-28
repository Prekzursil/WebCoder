# BENCH-i18n-gaps — WebCoder frontend i18n audit

Repo `C:\Users\Prekzursil\Documents\GitHub\WebCoder`, branch `wave/nextjs-migration`, HEAD `fb82580c`. Audit date 2026-09-28. Read-only audit — no code changes were made. Method: regex scan of all 60 git-tracked `.ts/.tsx/.js/.jsx` under `frontend/web/src` (node_modules excluded via `git ls-files`); resources parsed from the inline `resources` object in `frontend/web/src/i18n.ts`.

## Summary counts

| Metric | Value |
|---|---|
| Files scanned | 60 (git-tracked `.ts`/`.tsx`/`.js`/`.jsx` under `frontend/web/src`) |
| i18n config path | `frontend/web/src/i18n.ts` |
| `fallbackLng` | `'en'` (i18n.ts:71) |
| `supportedLngs` | NOT SET anywhere |
| `debug` | env-gated: `process.env.NODE_ENV === 'development'` (i18n.ts:72) |
| Resource layout | inline `resources` object in `i18n.ts` — no locale JSON files exist in the repo |
| Locales / key counts | `en` = 20 keys, `ro` = 20 keys — identical key sets |
| Distinct static keys used | 238 (268 occurrences) |
| Missing from all resources | 218 |
| True raw-key renders (no inline default) | 16 |
| Default-covered missing (inline English default) | 202 |
| Fallback-only keys | 0 |
| Dynamic `t()` callsites | 9 (9 comment-line matches excluded) |
| Key arrays / `getFixedT` / `preload` | none |

## Raw-key renders (16)

Keys missing from every locale resource and called WITHOUT an inline defaultValue — i18next renders the raw key itself (Romanian users see the key string, e.g. `comparison_mode_exact`, instead of text). All 16 are consumed in a single file: `frontend/web/src/app/problems/_components/ProblemFormPage.tsx`, lines 262–276.

| Key | Callsite |
|---|---|
| `comparison_mode_custom_checker` | `ProblemFormPage.tsx:271-273` (comparison-mode select options) |
| `comparison_mode_exact` | `ProblemFormPage.tsx:271-273` (comparison-mode select options) |
| `comparison_mode_float_precise` | `ProblemFormPage.tsx:271-273` (comparison-mode select options) |
| `comparison_mode_lines_strip_exact` | `ProblemFormPage.tsx:271-273` (comparison-mode select options) |
| `comparison_mode_strip_exact` | `ProblemFormPage.tsx:271-273` (comparison-mode select options) |
| `difficulty_easy` | `ProblemFormPage.tsx:262-263` (difficulty select options) |
| `difficulty_hard` | `ProblemFormPage.tsx:262-263` (difficulty select options) |
| `difficulty_medium` | `ProblemFormPage.tsx:262-263` (difficulty select options) |
| `problem_form_checker_code` | `ProblemFormPage.tsx:275` |
| `problem_form_checker_language` | `ProblemFormPage.tsx:274` |
| `problem_form_float_epsilon` | `ProblemFormPage.tsx:272` |
| `select_checker_language` | `ProblemFormPage.tsx:274` (placeholder) |
| `status_approved` | `ProblemFormPage.tsx:265-266` (status select options) |
| `status_draft` | `ProblemFormPage.tsx:265-266` (status select options) |
| `status_pending_approval` | `ProblemFormPage.tsx:265-266` (status select options) |
| `status_private` | `ProblemFormPage.tsx:265-266` (status select options) |

The dynamically-built `difficulty_${...}` / `status_${...}` keys (see Dynamic-key callsites) resolve into these same missing families, so the runtime raw-render surface extends beyond these 16 static sites.

## Default-covered missing (202)

The dominant porting pattern (documented at `app/_lib/public-i18n.ts:1-17`, citing `docs/PORT-MAP.md` §0.4) calls `t(key, 'English default')` with an inline English defaultValue at the callsite. When the key is missing from resources, i18next renders the defaultValue rather than the raw key, so all 202 keys below display correct English text in every locale. This is a translation-coverage gap for Romanian users (they get English strings), not a raw-render defect.

```
actions_th, actual_output_label, add_new_test_case_header, add_test_case_button, admin_dashboard.update_role_success, admin_dashboard.update_status_success, admin_dashboard_header, all_problems_option, already_have_account_prompt, approve_button, cancel_button, change_password_button, change_password_header, code_editor_label, code_placeholder, complete_registration_button, complete_registration_header, confirm_button, confirm_new_password_label, confirm_password_label, confirm_submission_message, confirm_submission_title, connect_github, connect_google, connected_accounts_header, create_problem_button, create_problem_header, current_password_label, date_joined, difficulty_label, edit_button, edit_problem_header, email, email_label, error_adding_test_case, error_approving_problem, error_auth_required, error_auth_required_action, error_auth_required_problem_form, error_auth_required_submission, error_code_empty, error_label, error_loading_my_problems, error_loading_pending_problems, error_loading_problem_for_edit, error_loading_problems, error_loading_submission_detail, error_loading_submissions, error_not_logged_in_or_no_problem, error_output_label, error_rejecting_problem, error_removing_test_case, error_saving_problem, error_select_language, error_submitting_for_approval, errors.failed_to_fetch_users, errors.failed_to_update_role, errors.failed_to_update_status, execution_time_label, expected_output_label, failed_to_load_profile, feedback_placeholder_rejection, feedback_required_for_rejection, filter_by_language_label, filter_by_problem_label, github_signup, google_signup, homepage_description, homepage_subtitle, input_data_label, is_sample_label, items_per_page_label, judge_feedback_header, language_filter_placeholder, language_label, language_th, loading, login_failed, login_failed_no_token, login_link_text, memory_label, memory_limit_label, memory_used_label, must_be_logged_in, my_created_problems_header, my_submissions_header, nav_admin_dashboard, nav_create_problem, nav_my_created_problems, nav_problem_queue, new_password_label, no_problems_available, no_problems_created_yet, no_problems_pending_approval, no_submissions_yet, not_found_default_header, not_found_default_message, or_signup_with, pagination_next, pagination_page_info, pagination_previous, password_change_failed, password_change_successful, passwords_do_not_match, please_login_to_submit_1, please_login_to_submit_2, please_login_to_submit_3, please_login_to_view_submissions, points_label, polling_status, problem_approved_successfully, problem_author_th, problem_created_successfully, problem_difficulty_th, problem_form_allowed_languages, problem_form_comparison_mode, problem_form_difficulty, problem_form_memory_limit_kb, problem_form_section_advanced_config, problem_form_section_config, problem_form_section_content, problem_form_section_tags, problem_form_statement_en, problem_form_statement_ro, problem_form_status, problem_form_test_cases_header, problem_form_time_limit_ms, problem_form_title_en, problem_form_title_ro, problem_id_label, problem_id_th, problem_label, problem_not_found, problem_rejected_successfully, problem_statement_header, problem_status_th, problem_submitted_for_approval_success, problem_th, problem_title_th, problem_updated_successfully, problem_verification_queue_header, problems_page_description, register_button, register_header, registration_completion_failed, registration_failed, registration_successful_redirecting, reject_button, remove_test_case_button, role, role_label, sample_input_label, sample_label, sample_output_label, sample_test_cases_header, save_changes_button, score_label, score_th, select_language_placeholder, site_statistics_title, solve_problem_description, sort_by_label, sort_option_language, sort_option_score, sort_option_time, sort_option_verdict, sort_order_asc, sort_order_desc, sort_order_label, status, submission_detail_header, submission_failed_error, submission_id_th, submission_not_found, submission_successful_pending, submission_time_label, submit_button, submit_for_approval_button, submit_solution_header, submitted_code_header, submitting_button_text, submitting_status, test_case_added_successfully, test_case_input_output_required, test_case_label, test_case_removed_successfully, test_case_results_header, time_label, time_limit_label, time_th, try_again_button, unauthorized_access, unknown_author, user_label, user_management_title, user_profile_header, username, verdict_label, verdict_th, verifier_feedback_label, verifier_feedback_th, view_problems_button
```

## Fallback-only by locale file

**None.** The inline `en` and `ro` blocks in `frontend/web/src/i18n.ts` carry IDENTICAL key sets (20 keys each), so no key exists in the fallback locale (`en`) that is missing from `ro` — the precondition for a fallback-only key is never met. No locale JSON files exist anywhere in the repo (resources are inline in `i18n.ts`), so there are no per-locale-file fallback gaps to enumerate either. The benchmark expectation of ~150 fallback-only keys does not hold for this repo.

## Dynamic-key callsites (UNVERIFIED)

Nine real dynamic callsites found; 9 additional regex matches were comment lines and were excluded:

- `frontend/web/src/app/admin/problem-queue/page.tsx:144` — `` t(`difficulty_${problem.difficulty.toLowerCase()}`) ``
- `frontend/web/src/app/my-created-problems/page.tsx:95` — `` t(`status_${problem.status.toLowerCase()}`) ``
- `frontend/web/src/app/my-created-problems/page.tsx:96` — `` t(`difficulty_${problem.difficulty.toLowerCase()}`) ``
- `frontend/web/src/app/my-submissions/page.tsx:225` — `` t(`verdict_${sub.verdict}`) ``
- `frontend/web/src/app/problems/[problemId]/page.tsx:88` — `` t(`difficulty_${problem.difficulty?.toLowerCase()}`) ``
- `frontend/web/src/app/problems/page.tsx:53` — `` t(`difficulty_${problem.difficulty?.toLowerCase()}`) ``
- `frontend/web/src/app/problems/page.tsx:55` — `` t(`status_${problem.status?.toLowerCase()}`) ``
- `frontend/web/src/app/profile/page.tsx:125` — `` t(`user_role_${profileUser.role.toLowerCase()}`) ``
- `frontend/web/src/app/submissions/[submissionId]/page.tsx:104 and :189` — `` t(`verdict_${...}`) ``

`difficulty_*` and `status_*` resolve into families that are missing from resources (raw render at runtime). `verdict_*` and `user_role_*` families have NO resource entries and no static counterparts — runtime enum values are UNVERIFIED by this static audit, and a verdict/role value outside the expected enums renders as a raw key.

## Debug flags

- `frontend/web/src/i18n.ts:71` — `fallbackLng: 'en'`
- `frontend/web/src/i18n.ts:72` — `debug: process.env.NODE_ENV === 'development'` — env-gated; the ONLY i18n debug flag; no hard-coded `debug: true` anywhere in `src`
- `supportedLngs` — NOT SET anywhere
- `saveMissing` / `missingKeyHandler` / `parseMissingKeyHandler` — ABSENT
- No `VITE_I18N_DEBUG` and no `import.meta.env` reads anywhere under `src`
- `NEXT_PUBLIC_API_BASE` reads (API host config, not i18n): `frontend/web/src/app/login/page.tsx:45`, `frontend/web/src/app/problems/_lib/problems-api.ts:22`, `frontend/web/src/app/profile/page.tsx:108`

## Worklist (concrete fix actions)

1. Fix the 16 raw renders: EITHER add the 16 keys to both `en` and `ro` blocks in `frontend/web/src/i18n.ts` OR pass an inline defaultValue at the `ProblemFormPage.tsx:262-276` callsites (matches the existing codebase pattern). The resources fix is preferred because it yields real translations.
2. Add `supportedLngs: ['en', 'ro']` to the `i18n.ts` init.
3. Add a runtime guard/test for the `verdict_*` / `user_role_*` dynamic families (no resource coverage, no static counterpart).
4. Strategic: migrate the inline resources to JSON locale files and add an i18next-parser CI check to stop the 202-key default-covered drift.
5. Extend `frontend/web/src/app/_lib/public-i18n.ts` `MESSAGES` beyond its 2 keys (or consume the shared resources) for server-rendered parity.
