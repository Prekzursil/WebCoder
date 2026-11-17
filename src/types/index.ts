// Shared type definitions for the WebCoder frontend
// Ported verbatim from frontend/webcoder_ui/src/types/index.ts (CRA reference).

export interface TestCaseType {
  id?: number;
  input_data: string;
  expected_output_data: string;
  is_sample: boolean;
  points: number;
  order?: number;
  subtask?: string;
  /** [wave E item 6] per-test time bar override. */
  time_limit_ms?: number | null;
}

export interface TestCaseUIManaged extends TestCaseType {
  local_id?: string;
}

export interface TagType {
  id: number;
  name_i18n: { [key: string]: string };
  slug: string;
}

/** Attribution for an approved community translation ("translated by @user"). */
export interface TranslationAttribution {
  language: string;
  contributor_username: string;
  reviewed_at: string | null;
}

export interface ProblemType {
  id: number;
  title_i18n: { [key: string]: string };
  difficulty: string;
  status: string;
  statement_i18n?: { [key: string]: string };
  default_time_limit_ms?: number;
  default_memory_limit_kb?: number;
  /** [wave E item 10] constraint ceiling for the pre-submit overflow lint. */
  constraint_max_value?: number | null;
  test_cases?: TestCaseType[];
  allowed_languages?: string[];
  custom_libraries_allowed?: string[]; // Added this based on backend model
  comparison_mode?: string;
  float_comparison_epsilon?: number | null;
  checker_code?: string | null;
  checker_language?: string | null;
  // Wave D interactive problems (JDG-2): NORMAL | INTERACTIVE.
  problem_type?: string;
  interactor_code?: string | null;
  interactor_language?: string | null;
  tag_ids?: number[];
  tags?: TagType[];
  verifier_feedback?: string | null;
  author?: { id: number; username: string };
  // Wave A learning layer (EDT-1/EDT-2) + provenance (CNT-3)
  hints_ro?: string[];
  hints_en?: string[];
  has_editorial?: boolean;
  editorial_locked?: boolean;
  difficulty_source?: string;
  // Language-fair limits (J5): per-language overrides + the judge-resolved
  // effective limits the problem page displays per allowed language.
  limit_overrides?: Record<string, { time_ms?: number; memory_kb?: number }>;
  effective_limits?: Record<string, { time_ms: number; memory_kb: number }>;
  // Console vs file I/O (RO-4): 'STDIO' | 'FILES' + the FILES-mode names.
  io_mode?: string;
  io_input_filename?: string;
  io_output_filename?: string;
  // Wave E: partial-code problems — full skeleton + locked regions.
  code_template?: string;
  code_template_language?: string;
  // Olympiad-archive provenance (roadmap RO-6/CNT-2): where the problem
  // came from — the archive browse axis + attribution chips.
  source_contest?: string;
  source_year?: number | null;
  grade_group?: string;
  // Community-translation attribution (i18n wave, owner rule (c)): the
  // "translated by @user" credits, sourced from approved proposals.
  translations?: TranslationAttribution[];
  // Wave D: block programming — BOTH engines (owner directive 2026-10-30).
  // engine 'blockly' (default): generator + toolbox/starter XML.
  // engine 'scratch': sb3 starter project JSON + curated opcode allowlist.
  block_config?: {
    engine?: 'blockly' | 'scratch';
    generator?: 'python3' | 'nodejs20';
    toolbox?: string;
    starter?: string;
    scratch_project?: string;
    scratch_blocks?: string[];
  };
  // Wave C: per-problem library & feature policy (creator-controlled).
  library_policy?: {
    [language: string]: {
      banned_stdlib?: string[];
      banned?: string[];
      allowed?: string[];
    };
  } & { banned_features?: string[] };
}

export interface SubmissionType {
  id: number;
  problem: { id: number; title_i18n: { [key: string]: string } };
  language: string;
  verdict: string;
  submission_time: string;
  score?: number | null;
}

export interface SubmissionTestResultType {
  id: number;
  test_case_details: {
    id: number;
    order?: number;
    is_sample: boolean;
    points: number;
    /** Wave E item 7: present for sample tests (and privileged viewers) —
     * the pair the WA diff viewer renders. */
    input_data?: string;
    expected_output_data?: string;
  };
  verdict: string;
  execution_time_ms?: number | null;
  memory_used_kb?: number | null;
  /** Wave E items 6/19/25: the bar the judge applied to this test. */
  limit_time_ms?: number | null;
  limit_memory_kb?: number | null;
  actual_output?: string | null;
  error_output?: string | null;
}

/** Wave E item 21: banded score/full_score reading ("Am I close?"). */
export interface ClosenessType {
  band: 'SOLVED' | 'SO_CLOSE' | 'HALFWAY' | 'STARTED' | 'NONE';
  ratio: number;
}

export interface DetailedSubmissionType extends SubmissionType {
  code: string;
  detailed_feedback?: string;
  execution_time_ms?: number | null;
  memory_used_kb?: number | null;
  /** Matrix row 61: faster-than share of same-problem+language ACs. */
  runtime_percentile?: number | null;
  /** Wave E item 21: banded closeness reading, null when unscored. */
  closeness?: ClosenessType | null;
  /** Wave E item 14: bilingual explainers mapped from the raw compiler
   * diagnostics (CE verdicts only; empty otherwise). */
  compile_hints?: { hint_en: string; hint_ro: string }[];
  user?: { username: string; id: number };
  test_results?: SubmissionTestResultType[];
}

export interface User {
  id: number;
  username: string;
  email: string;
  // Backend serializes the SHORT TextChoices values (BASIC/CREATOR/
  // VERIFIER/TEACHER/ADMIN); the long spellings are legacy tolerance.
  role:
    | 'BASIC'
    | 'CREATOR'
    | 'VERIFIER'
    | 'TEACHER'
    | 'ADMIN'
    | 'BASIC_USER'
    | 'PROBLEM_CREATOR'
    | 'PROBLEM_VERIFIER';
  // OPS-2 (Wave D): the login-side two-factor signals.
  two_factor_enabled?: boolean;
  two_factor_required?: boolean /** RO-3: Olympiad-geography identity (optional; feeds segmented boards). */;
  county?: string;
  /** Matrix row 59: self-authored public bio (max 500 chars, optional). */
  bio?: string;
  school?: string;
  /** LEG-2: self-declared minor — county/school stay private to others. */
  is_minor?: boolean;
}

export interface AdminUserType extends User {
  is_staff: boolean;
  is_active: boolean;
  date_joined: string;
  first_name?: string;
  last_name?: string;
}
